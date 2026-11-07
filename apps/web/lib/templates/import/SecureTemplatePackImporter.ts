/**
 * FactoryOS Secure Template Pack Importer (TypeScript)
 * Coordinates sandboxed inspection, CAS ingestion, template normalization,
 * and idempotent registry upsert.
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { execFileSync } from 'node:child_process';
import { 
  ShortForgeTemplatePackManifestSchema, 
  ShortForgeTemplatePackManifest, 
  normalizeTemplatePackToDefinition 
} from '../schemas/TemplatePackSchema';
import { TemplateDefinition } from '../schemas/TemplateSchema';
import { TemplateRegistry } from '../registry/TemplateRegistry';
import { ContentAddressedStore } from '../../../factoryos/core/compute/cas/ContentAddressedStore';

export interface ImportPackResult {
  success: boolean;
  error?: string;
  template?: TemplateDefinition;
  manifest?: ShortForgeTemplatePackManifest;
  assetInventory?: Array<{
    assetId: string;
    role: string;
    fileName: string;
    sha256: string;
    byteLength: number;
    mimeType: string;
    casUri?: string;
    dimensions?: { width: number; height: number };
  }>;
  previewUrl?: string;
}

export class SecureTemplatePackImporter {
  private pythonBin: string;
  private cas: ContentAddressedStore;

  constructor(customPythonBin?: string) {
    this.pythonBin = customPythonBin || process.env.FACTORYOS_RENDER_PYTHON || (os.platform() === 'win32' ? 'python' : 'python3');
    this.cas = ContentAddressedStore.getInstance();
  }

  /**
   * Imports a template pack ZIP archive.
   * Performs full verification: zip bombs, symlinks, path traversal, magic bytes,
   * manifest schema, SHA-256 integrity, CAS storage, and registry registration.
   */
  public async importPackFromZip(zipFilePath: string): Promise<ImportPackResult> {
    if (!fs.existsSync(zipFilePath)) {
      return { success: false, error: `ZIP file not found at ${zipFilePath}` };
    }

    const tempExtractDir = path.join(
      os.tmpdir(), 
      `shortforge_pack_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
    );

    try {
      // 1. Run Python sandboxed pack inspector
      const inspectorScript = path.resolve(__dirname, 'pack_inspector.py');
      let stdout: string;
      try {
        stdout = execFileSync(
          this.pythonBin, 
          [inspectorScript, zipFilePath, tempExtractDir], 
          { encoding: 'utf-8', timeout: 30000 }
        );
      } catch (err: any) {
        const stderr = err.stderr ? err.stderr.toString() : '';
        const stdoutErr = err.stdout ? err.stdout.toString() : '';
        let errorMsg = 'Failed to inspect ZIP archive';
        try {
          const parsed = JSON.parse(stdoutErr || stderr);
          if (parsed.error) errorMsg = parsed.error;
        } catch {
          errorMsg = stderr || err.message;
        }
        return { success: false, error: errorMsg };
      }

      const inspection = JSON.parse(stdout);
      if (!inspection.success) {
        return { success: false, error: inspection.error || 'Inspection failed' };
      }

      // 2. Validate manifest schema
      const manifestParse = ShortForgeTemplatePackManifestSchema.safeParse(inspection.manifest);
      if (!manifestParse.success) {
        return {
          success: false,
          error: `Manifest validation failed: ${manifestParse.error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ')}`
        };
      }
      const manifest = manifestParse.data;

      // 3. Build file lookup by normalized relative path
      const extractedFiles: Array<any> = inspection.files;
      const fileMap = new Map<string, any>();
      for (const file of extractedFiles) {
        const normRel = file.relativePath.replace(/\\/g, '/').toLowerCase();
        fileMap.set(normRel, file);
        fileMap.set(path.basename(normRel), file);
      }

      // 4. Validate asset bindings against physical files
      const assetInventory: ImportPackResult['assetInventory'] = [];
      const resolvedCasUris: Record<string, string> = {};

      for (const binding of manifest.assetBindings) {
        const normName = binding.fileName.replace(/\\/g, '/').toLowerCase();
        const baseName = path.basename(normName);
        const fileRecord = fileMap.get(normName) || fileMap.get(baseName);

        if (!fileRecord) {
          return {
            success: false,
            error: `Missing asset referenced in manifest: '${binding.fileName}' (assetId: ${binding.assetId})`
          };
        }

        // Verify SHA-256 if specified in manifest
        if (binding.sha256 && binding.sha256.toLowerCase() !== fileRecord.sha256.toLowerCase()) {
          return {
            success: false,
            error: `SHA-256 integrity mismatch for '${binding.fileName}': expected ${binding.sha256}, got ${fileRecord.sha256}`
          };
        }

        // Store into ContentAddressedStore (CAS)
        const casRef = await this.cas.putFile(
          fileRecord.absolutePath,
          binding.role,
          fileRecord.mimeType,
          {
            templateId: manifest.identity.id,
            templateVersion: manifest.identity.version,
            assetId: binding.assetId,
            originalFileName: binding.fileName
          }
        );

        resolvedCasUris[binding.assetId] = casRef.uri;

        assetInventory.push({
          assetId: binding.assetId,
          role: binding.role,
          fileName: binding.fileName,
          sha256: fileRecord.sha256,
          byteLength: fileRecord.byteLength,
          mimeType: fileRecord.mimeType,
          casUri: casRef.uri,
          dimensions: fileRecord.dimensions
        });
      }

      // 5. Cache visual assets to local packs directory for fast render compositor lookup
      const packId = manifest.identity.id;
      const targetPackDir = path.resolve(process.cwd(), 'assets', 'canva', 'packs', packId);
      if (!fs.existsSync(targetPackDir)) {
        fs.mkdirSync(targetPackDir, { recursive: true });
      }

      for (const file of extractedFiles) {
        const dest = path.join(targetPackDir, path.basename(file.relativePath));
        fs.copyFileSync(file.absolutePath, dest);
      }
      // Also save raw manifest.json in the pack dir
      fs.writeFileSync(
        path.join(targetPackDir, 'manifest.json'),
        JSON.stringify(manifest, null, 2),
        'utf-8'
      );

      // 6. Normalize to native TemplateDefinition
      const templateDef = normalizeTemplatePackToDefinition(manifest, resolvedCasUris);

      // Attach design pack metadata directly to template definition
      templateDef.designPack = {
        packId: manifest.identity.id,
        sourceProvenance: manifest.sourceProvenance.provider,
        assetBindings: resolvedCasUris
      };

      // 7. Idempotent Upsert in TemplateRegistry
      const registry = TemplateRegistry.getInstance();
      const regResult = registry.registerTemplate(templateDef);
      if (!regResult.success) {
        return { success: false, error: regResult.error };
      }

      // 8. Idempotent Upsert in data/custom-templates.json
      this.upsertCustomTemplate(templateDef);

      return {
        success: true,
        template: templateDef,
        manifest,
        assetInventory
      };
    } finally {
      // Clean up temporary extraction directory
      if (fs.existsSync(tempExtractDir)) {
        try {
          fs.rmSync(tempExtractDir, { recursive: true, force: true });
        } catch {}
      }
    }
  }

  /**
   * Idempotently persists template to data/custom-templates.json.
   * If a template with the same identity.id and identity.version already exists,
   * it replaces it in-place instead of creating duplicate records.
   */
  public upsertCustomTemplate(templateDef: TemplateDefinition): void {
    const dataDir = path.resolve(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const customFilePath = path.join(dataDir, 'custom-templates.json');
    let existing: any[] = [];
    if (fs.existsSync(customFilePath)) {
      try {
        existing = JSON.parse(fs.readFileSync(customFilePath, 'utf-8'));
        if (!Array.isArray(existing)) existing = [];
      } catch {
        existing = [];
      }
    }

    const targetKey = `${templateDef.identity.id}@${templateDef.identity.version}`;
    const index = existing.findIndex(t => {
      const id = t.identity?.id || t.id;
      const ver = t.identity?.version || t.version || '1.0.0';
      return `${id}@${ver}` === targetKey;
    });

    if (index >= 0) {
      existing[index] = templateDef;
    } else {
      existing.push(templateDef);
    }

    fs.writeFileSync(customFilePath, JSON.stringify(existing, null, 2), 'utf-8');
  }
}
