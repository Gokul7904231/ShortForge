/**
 * ShortForge / FactoryOS — OKF Knowledge Store
 * Plain-file durable knowledge manager with atomic writes, concurrency safety, and search.
 * Validates pure OKF v0.2 conformance separately from ShortForge quality checks.
 */

import fs from "node:fs";
import path from "node:path";
import {
  KnowledgeContentType,
  KnowledgeDocument,
  KnowledgeFilter,
  KnowledgeValidationReport,
  OKFConformanceReport,
  OKFFrontmatter,
  ShortForgeQualityReport,
} from "./OKFContracts";
import { OKFParser } from "./OKFParser";

export class KnowledgeStore {
  private rootDir: string;
  private documents: Map<string, KnowledgeDocument> = new Map();
  private documentsByPath: Map<string, KnowledgeDocument> = new Map();
  private parseErrors: Array<{ filePath: string; error: string }> = [];
  private duplicateIdErrors: Array<{ id: string; filePaths: string[] }> = [];

  // Expanded secret detection corpus
  private static SECRET_REGEXES = [
    /bearer\s+[a-zA-Z0-9_\-\.]{20,}/i,
    /AIzaSy[a-zA-Z0-9_\-]{33}/, // Google API key
    /gsk_[a-zA-Z0-9]{20,}/, // Groq key
    /clerk_[a-zA-Z0-9_\-]{16,}/i,
    /(?:ghp|github_pat|gho|ghu|ghs|ghr)_[a-zA-Z0-9_]{16,}/, // GitHub tokens
    /eyJ[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}/, // JWT
    /AKIA[0-9A-Z]{16}/, // AWS Access Key
    /-----BEGIN (?:[A-Z0-9_-]+ )?PRIVATE KEY-----/, // PEM Private key
    /(?:postgres|postgresql|mongodb|mysql|sqlite|redis):\/\/[^:\s]+:([^@\s]+)@/i, // DB URI credentials
    /(?:INTERNAL_API_SECRET_KEY|API_KEY|SECRET_KEY|AUTH_SECRET)\s*=\s*[^\s]+/i,
    /password\s*[:=]\s*["'][^"']+["']/i,
  ];

  constructor(vaultPath?: string) {
    if (vaultPath) {
      this.rootDir = path.isAbsolute(vaultPath) ? vaultPath : path.resolve(process.cwd(), vaultPath);
    } else {
      let candidate = path.resolve(process.cwd(), "knowledge");
      if (!fs.existsSync(candidate)) {
        const parentCandidate = path.resolve(process.cwd(), "..", "..", "knowledge");
        if (fs.existsSync(parentCandidate)) {
          candidate = parentCandidate;
        } else {
          const oneUp = path.resolve(process.cwd(), "..", "knowledge");
          if (fs.existsSync(oneUp)) candidate = oneUp;
        }
      }
      this.rootDir = candidate;
    }

    this.reload();
  }

  public getRootDir(): string {
    return this.rootDir;
  }

  public getParseErrors(): Array<{ filePath: string; error: string }> {
    return [...this.parseErrors];
  }

  public getDuplicateIdErrors(): Array<{ id: string; filePaths: string[] }> {
    return [...this.duplicateIdErrors];
  }

  public reload(): void {
    this.documents.clear();
    this.documentsByPath.clear();
    this.parseErrors = [];
    this.duplicateIdErrors = [];

    if (!fs.existsSync(this.rootDir)) {
      return;
    }

    // Step 1: Collect all markdown file paths
    const markdownPaths: string[] = [];
    const scanDir = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDir(fullPath);
        } else if (entry.isFile() && entry.name.endsWith(".md")) {
          markdownPaths.push(fullPath);
        }
      }
    };
    scanDir(this.rootDir);

    // Step 2: Parse each document, recording parse errors without silent suppression
    const rawParsed: Array<{ doc: KnowledgeDocument; relPath: string }> = [];
    const idToPaths = new Map<string, string[]>();

    for (const fullPath of markdownPaths) {
      const relPath = path.relative(this.rootDir, fullPath).replace(/\\/g, "/");
      try {
        const raw = fs.readFileSync(fullPath, "utf-8");
        if (!raw.trimStart().startsWith("---")) {
          this.parseErrors.push({
            filePath: relPath,
            error: `File ${relPath} is missing leading YAML frontmatter '---' delimiter.`,
          });
          continue;
        }

        const doc = OKFParser.parse(raw, relPath);
        const docId = doc.frontmatter.sf_id || doc.frontmatter.id;
        rawParsed.push({ doc, relPath });

        const existingPaths = idToPaths.get(docId) || [];
        existingPaths.push(relPath);
        idToPaths.set(docId, existingPaths);
      } catch (err) {
        this.parseErrors.push({
          filePath: relPath,
          error: (err as Error).message || String(err),
        });
      }
    }

    // Step 3: Check for duplicate IDs across all scanned files BEFORE populating Maps
    for (const [id, paths] of idToPaths.entries()) {
      if (paths.length > 1) {
        this.duplicateIdErrors.push({ id, filePaths: paths });
      }
    }

    // Step 4: Populate documents map (if duplicate exists, index first but record duplicate error)
    for (const { doc, relPath } of rawParsed) {
      const docId = doc.frontmatter.sf_id || doc.frontmatter.id;
      if (!this.documents.has(docId)) {
        this.documents.set(docId, doc);
      }
      this.documentsByPath.set(relPath, doc);
    }
  }

  public get(id: string): KnowledgeDocument | null {
    return this.documents.get(id) || null;
  }

  public getByPath(relPath: string): KnowledgeDocument | null {
    const normalized = relPath.replace(/\\/g, "/");
    return this.documentsByPath.get(normalized) || null;
  }

  public list(filter?: KnowledgeFilter): KnowledgeDocument[] {
    let docs = Array.from(this.documents.values());

    if (filter) {
      if (filter.type) {
        docs = docs.filter((d) => d.frontmatter.type === filter.type);
      }
      if (filter.status) {
        docs = docs.filter(
          (d) => d.frontmatter.status === filter.status || d.frontmatter.sf_lifecycle === filter.status
        );
      }
      if (filter.sf_lifecycle) {
        docs = docs.filter((d) => d.frontmatter.sf_lifecycle === filter.sf_lifecycle);
      }
      if (filter.epistemic_state || filter.sf_epistemic_state) {
        const target = filter.sf_epistemic_state || filter.epistemic_state;
        docs = docs.filter(
          (d) => d.frontmatter.sf_epistemic_state === target || d.frontmatter.epistemic_state === target
        );
      }
      if (filter.verification || filter.sf_verification_state) {
        const target = filter.sf_verification_state || filter.verification;
        docs = docs.filter(
          (d) => d.frontmatter.sf_verification_state === target || d.frontmatter.verification === target
        );
      }
      if (filter.tags && filter.tags.length > 0) {
        docs = docs.filter((d) =>
          d.frontmatter.tags && filter.tags!.some((t) => d.frontmatter.tags!.includes(t))
        );
      }
    }

    return docs;
  }

  /**
   * Relevance scoring: Exact match bonus, stem matching, and term frequency.
   */
  public search(query: string, options?: { type?: KnowledgeContentType; limit?: number }): KnowledgeDocument[] {
    const qLower = query.toLowerCase();
    const stopWords = new Set([
      "where", "what", "why", "how", "when", "did", "we", "the", "is", "are",
      "a", "an", "in", "on", "for", "of", "to", "and", "or", "over", "before",
      "after", "should", "know", "only", "give", "me", "this", "that",
    ]);
    const rawTokens = qLower.split(/[^a-z0-9_-]+/).filter((t) => t.length >= 3 && !stopWords.has(t));
    const tokens = rawTokens.length > 0 ? rawTokens : [qLower];

    const limit = options?.limit || 10;
    const scored: Array<{ doc: KnowledgeDocument; score: number }> = [];

    for (const doc of this.documents.values()) {
      if (options?.type && doc.frontmatter.type !== options.type) continue;

      let score = 0;
      const titleLower = (doc.frontmatter.title || "").toLowerCase();
      const idLower = (doc.frontmatter.id || "").toLowerCase();
      const contentLower = doc.content.toLowerCase();
      const tagsLower = (doc.frontmatter.tags || []).map((t) => t.toLowerCase()).join(" ");

      if (idLower.includes(qLower)) score += 50;
      if (titleLower.includes(qLower)) score += 30;

      for (const tok of tokens) {
        const stems = [tok];
        if (tok.length > 4) {
          const stemmed = tok.replace(/(?:ing|ers?|ed|es|s)$/, "");
          if (stemmed.length >= 3) stems.push(stemmed);
        }

        for (const s of stems) {
          if (idLower.includes(s)) score += 15;
          if (titleLower.includes(s)) score += 10;
          if (tagsLower.includes(s)) score += 8;
          if (contentLower.includes(s)) score += 3;
        }
      }

      if (score > 0) {
        scored.push({ doc, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map((s) => s.doc);
  }

  /**
   * Atomic file writing with directory creation and rename.
   * NOTE: Protects readers from partial writes on a single host,
   * but does NOT provide distributed multi-writer transactional concurrency.
   */
  public async create(params: {
    frontmatter: OKFFrontmatter;
    content: string;
    subDir?: string;
  }): Promise<KnowledgeDocument> {
    const subDir = params.subDir || `${params.frontmatter.type}s`;
    const targetDir = path.join(this.rootDir, subDir);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const fileName = `${params.frontmatter.id}.md`;
    const finalPath = path.join(targetDir, fileName);
    const tempPath = path.join(targetDir, `.${fileName}.tmp-${Date.now()}`);

    const rawString = OKFParser.stringify({
      frontmatter: params.frontmatter,
      content: params.content,
    });

    fs.writeFileSync(tempPath, rawString, "utf-8");
    fs.renameSync(tempPath, finalPath);

    const relPath = path.relative(this.rootDir, finalPath).replace(/\\/g, "/");
    const doc: KnowledgeDocument = {
      frontmatter: params.frontmatter,
      content: params.content,
      filePath: relPath,
    };

    this.documents.set(doc.frontmatter.id, doc);
    this.documentsByPath.set(relPath, doc);
    return doc;
  }

  public async update(
    id: string,
    updates: { frontmatter?: Partial<OKFFrontmatter>; content?: string }
  ): Promise<KnowledgeDocument> {
    const existing = this.documents.get(id);
    if (!existing) {
      throw new Error(`Knowledge document with id '${id}' not found.`);
    }

    const updatedFrontmatter: OKFFrontmatter = {
      ...existing.frontmatter,
      ...(updates.frontmatter || {}),
      updated_at: new Date().toISOString(),
    };

    const updatedContent = updates.content !== undefined ? updates.content : existing.content;
    const finalPath = path.join(this.rootDir, existing.filePath);
    const tempPath = `${finalPath}.tmp-${Date.now()}`;

    const rawString = OKFParser.stringify({
      frontmatter: updatedFrontmatter,
      content: updatedContent,
    });

    fs.writeFileSync(tempPath, rawString, "utf-8");
    fs.renameSync(tempPath, finalPath);

    const updatedDoc: KnowledgeDocument = {
      frontmatter: updatedFrontmatter,
      content: updatedContent,
      filePath: existing.filePath,
    };

    this.documents.set(id, updatedDoc);
    this.documentsByPath.set(existing.filePath, updatedDoc);
    return updatedDoc;
  }

  public async supersede(id: string, newDocId: string, reason?: string): Promise<void> {
    await this.update(id, {
      frontmatter: {
        status: "deprecated",
        sf_lifecycle: "superseded",
        sf_superseded_by: newDocId,
        superseded_by: newDocId,
        valid_until: new Date().toISOString(),
        sf_valid_until: new Date().toISOString(),
      },
    });
  }

  public async archive(id: string, reason?: string): Promise<void> {
    await this.update(id, {
      frontmatter: {
        status: "deprecated",
        sf_lifecycle: "archived",
        valid_until: new Date().toISOString(),
        sf_valid_until: new Date().toISOString(),
      },
    });
  }

  /**
   * Pure OKF v0.2 Conformance Validation:
   * Confirms `type` presence, standard status values, reserved filenames,
   * sources array structure, and verified array structure.
   */
  public validateOKFConformance(): OKFConformanceReport {
    const missingTypeErrors: string[] = [];
    const invalidStatusErrors: string[] = [];
    const malformedSourceErrors: string[] = [];
    const malformedVerificationErrors: string[] = [];
    const validStatuses = new Set(["draft", "stable", "deprecated"]);

    for (const doc of this.documents.values()) {
      const fm = doc.frontmatter;

      // 1. type is required in OKF v0.2
      if (!fm.type || typeof fm.type !== "string" || fm.type.trim() === "") {
        missingTypeErrors.push(`Document ${doc.filePath} missing required OKF 'type' field.`);
      }

      // 2. status if present must be draft, stable, or deprecated in OKF v0.2
      if (fm.status && !validStatuses.has(fm.status)) {
        // Tolerated if sf_lifecycle is present, but flag if status is non-standard
        invalidStatusErrors.push(
          `Document ${doc.filePath} has non-standard OKF status '${fm.status}'. Expected draft|stable|deprecated.`
        );
      }

      // 3. sources array validation
      if (fm.sources) {
        if (!Array.isArray(fm.sources)) {
          malformedSourceErrors.push(`Document ${doc.filePath} has malformed 'sources' (must be array).`);
        } else {
          for (const s of fm.sources) {
            if (!s.id || !s.resource) {
              malformedSourceErrors.push(`Document ${doc.filePath} has source reference missing 'id' or 'resource'.`);
            }
          }
        }
      }

      // 4. verified array validation
      if (fm.verified) {
        if (!Array.isArray(fm.verified)) {
          malformedVerificationErrors.push(`Document ${doc.filePath} has malformed 'verified' (must be array).`);
        } else {
          for (const v of fm.verified) {
            if (!v.by || !v.at) {
              malformedVerificationErrors.push(`Document ${doc.filePath} has verification record missing 'by' or 'at'.`);
            }
          }
        }
      }
    }

    const parseErrors = this.parseErrors.map((p) => `Parse Error in ${p.filePath}: ${p.error}`);
    const errors = [
      ...parseErrors,
      ...missingTypeErrors,
      ...invalidStatusErrors,
      ...malformedSourceErrors,
      ...malformedVerificationErrors,
    ];

    return {
      compliant: errors.length === 0,
      totalDocuments: this.documents.size,
      parseErrors,
      missingTypeErrors,
      invalidStatusErrors,
      malformedSourceErrors,
      malformedVerificationErrors,
      errors,
    };
  }

  /**
   * ShortForge Knowledge Quality Validation:
   * Checks duplicate IDs, secret leaks, broken internal Markdown links (as warnings/quality flags),
   * missing provenance, and required ShortForge fields.
   */
  public validateShortForgeKnowledgeQuality(): ShortForgeQualityReport {
    const duplicateIds = this.duplicateIdErrors.map((d) => d.id);
    const secretLeakErrors: string[] = [];
    const brokenInternalLinks: string[] = [];
    const missingProvenanceWarnings: string[] = [];
    const staleDocumentWarnings: string[] = [];
    const documentsByType: Record<string, number> = {};

    for (const doc of this.documents.values()) {
      const fm = doc.frontmatter;

      // Count by type
      documentsByType[fm.type] = (documentsByType[fm.type] || 0) + 1;

      // Check secret patterns in frontmatter and content
      const fullText = JSON.stringify(fm) + " " + doc.content;
      for (const rx of KnowledgeStore.SECRET_REGEXES) {
        if (rx.test(fullText)) {
          secretLeakErrors.push(`Secret pattern detected in ${doc.filePath}: ${rx.source}`);
        }
      }

      // Quality: check Markdown links [text](relative_path.md)
      const linkRegex = /\[([^\]]+)\]\(([^)]+\.md)\)/g;
      let match: RegExpExecArray | null;
      while ((match = linkRegex.exec(doc.content)) !== null) {
        const target = match[2];
        // Resolve target relative to document directory
        const docDir = path.dirname(path.join(this.rootDir, doc.filePath));
        const resolvedTarget = path.resolve(docDir, target);
        if (!fs.existsSync(resolvedTarget)) {
          brokenInternalLinks.push(`${doc.filePath} -> ${target}`);
        }
      }

      // Quality: check provenance presence
      if (!fm.sf_provenance && !fm.provenance && !fm.sources) {
        missingProvenanceWarnings.push(`Document ${doc.filePath} has no recorded provenance or sources.`);
      }
    }

    const parseErrors = this.parseErrors.map((p) => `Parse error in ${p.filePath}: ${p.error}`);
    const errors = [
      ...duplicateIds.map((id) => `Duplicate ID: ${id}`),
      ...parseErrors,
      ...secretLeakErrors,
    ];
    const warnings = [...brokenInternalLinks, ...missingProvenanceWarnings, ...staleDocumentWarnings];

    return {
      passing: errors.length === 0,
      totalDocuments: this.documents.size,
      documentsByType,
      duplicateIds,
      parseErrors,
      secretLeakErrors,
      brokenInternalLinks,
      missingProvenanceWarnings,
      staleDocumentWarnings,
      errors,
      warnings,
    };
  }

  /**
   * Unified validation report for backwards compatibility and CLI doctoring.
   */
  public validate(): KnowledgeValidationReport {
    const okfReport = this.validateOKFConformance();
    const sfReport = this.validateShortForgeKnowledgeQuality();

    const missingRequiredFieldErrors: string[] = [];
    for (const doc of this.documents.values()) {
      const fm = doc.frontmatter;
      if (!fm.id || !fm.type || !fm.title) {
        missingRequiredFieldErrors.push(`Document ${doc.filePath} missing required frontmatter fields.`);
      }
    }

    const errors = [
      ...okfReport.errors,
      ...sfReport.errors,
      ...missingRequiredFieldErrors,
    ];

    return {
      valid: errors.length === 0,
      totalDocuments: this.documents.size,
      documentsByType: sfReport.documentsByType,
      duplicateIds: sfReport.duplicateIds,
      parseErrors: sfReport.parseErrors,
      secretLeakErrors: sfReport.secretLeakErrors,
      missingRequiredFieldErrors,
      errors,
      okfConformance: okfReport,
      sfQuality: sfReport,
    };
  }
}
