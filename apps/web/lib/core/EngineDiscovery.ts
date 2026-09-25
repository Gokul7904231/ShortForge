/**
 * EngineDiscovery — Auto-discovers and registers all content engines
 *
 * Scans the content-engines directory and dynamically imports each engine's
 * index.ts which triggers WorkflowLoader.register(). No manual imports needed.
 * Also handles persistent custom engines and custom templates stored in data/ folder.
 */

import fs from "fs";
import path from "path";
import { WorkflowLoader, type WorkflowManifest } from "../../content-engines/_loader";
import { PromptRegistry } from "../../prompts/registry";

const ENGINES_DIR = path.resolve(process.cwd(), "content-engines");
const SKIP_DIRS = new Set(["_loader", "_runtime", "_types"]);

class EngineDiscoveryClass {
  private discovered: string[] = [];
  private initialized = false;

  async discoverAll(): Promise<string[]> {
    if (this.initialized) return this.discovered;

    // 1. Discover official disk-based content engines
    const entries = fs.readdirSync(ENGINES_DIR, { withFileTypes: true });
    const engineDirs = entries.filter(
      (e) => e.isDirectory() && !SKIP_DIRS.has(e.name)
    );

    for (const dir of engineDirs) {
      const indexPath = path.join(ENGINES_DIR, dir.name, "index.ts");
      const indexJsPath = path.join(ENGINES_DIR, dir.name, "index.js");

      const exists = fs.existsSync(indexPath) || fs.existsSync(indexJsPath);
      if (!exists) {
        console.warn(`[EngineDiscovery] Skipping "${dir.name}" — no index.ts found.`);
        continue;
      }

      try {
        // Dynamic import triggers WorkflowLoader.register() inside each engine's index.ts
        await import(`../../content-engines/${dir.name}/index`);
        if (!this.discovered.includes(dir.name)) {
          this.discovered.push(dir.name);
        }
        console.log(`[EngineDiscovery] ✅ Registered engine: "${dir.name}"`);
      } catch (err: any) {
        console.error(`[EngineDiscovery] ❌ Failed to load engine "${dir.name}": ${err.message}`);
      }
    }

    // 2. Discover custom dynamic engines
    this.loadCustomEngines();

    // 3. Discover custom dynamic templates
    this.loadCustomTemplates();

    this.initialized = true;
    console.log(`[EngineDiscovery] Complete — ${this.discovered.length} engines registered: [${this.discovered.join(", ")}]`);
    return this.discovered;
  }

  getDiscovered(): string[] {
    return this.discovered;
  }

  // Load custom engines from JSON
  private loadCustomEngines() {
    try {
      const dataDir = path.resolve(process.cwd(), "data");
      const filePath = path.join(dataDir, "custom-engines.json");
      if (fs.existsSync(filePath)) {
        const fileContent = fs.readFileSync(filePath, "utf-8");
        const engines = JSON.parse(fileContent);
        for (const eng of engines) {
          // Register dynamic prompts in memory
          if (eng.prompt) {
            PromptRegistry.registerMemoryPrompt(`hook:${eng.id}`, eng.prompt);
          }
          if (eng.sceneRules) {
            PromptRegistry.registerMemoryPrompt(`scene:${eng.id}`, eng.sceneRules);
          }
          // Register workflow
          WorkflowLoader.register({
            id: eng.id,
            name: eng.name,
            version: eng.version || "1.0",
            renderProfile: eng.renderProfile || "FAST_QUIZ",
            hookPromptSlug: eng.prompt ? `hook:${eng.id}` : "hook:v1",
            scenePromptSlug: eng.sceneRules ? `scene:${eng.id}` : "scene:v1",
            configuration: eng.configuration,
            contracts: eng.contracts,
            steps: eng.steps || [
              { id: "script", enabled: true, retry: 2 },
              { id: "critic", enabled: true, approvalRequired: false },
              { id: "scene", enabled: true },
              { id: "voice", enabled: true },
              { id: "image", enabled: true, timeout: 30000 },
              { id: "render", enabled: true },
              { id: "upload", enabled: true },
              { id: "publish", enabled: true }
            ]
          });
          if (!this.discovered.includes(eng.id)) {
            this.discovered.push(eng.id);
          }
        }
        console.log(`[EngineDiscovery] Registered ${engines.length} custom engines from custom-engines.json`);
      }
    } catch (e: any) {
      console.warn(`[EngineDiscovery] Failed to load custom engines:`, e.message);
    }
  }

  // Load custom templates on startup
  private loadCustomTemplates() {
    try {
      const dataDir = path.resolve(process.cwd(), "data");
      const filePath = path.join(dataDir, "custom-templates.json");
      if (fs.existsSync(filePath)) {
        const fileContent = fs.readFileSync(filePath, "utf-8");
        const templates = JSON.parse(fileContent);
        for (const tpl of templates) {
          // Register template prompt in memory
          if (tpl.prompt) {
            PromptRegistry.registerMemoryPrompt(`hook:${tpl.id}`, tpl.prompt);
          }
          // Register template as a workflow manifest
          WorkflowLoader.register({
            id: tpl.id,
            name: tpl.name,
            version: tpl.version || "1.0",
            renderProfile: tpl.renderProfile || "FAST_SHORTS",
            hookPromptSlug: `hook:${tpl.id}`,
            steps: [
              { id: "script", enabled: true },
              { id: "critic", enabled: true, approvalRequired: false },
              { id: "scene", enabled: true },
              { id: "voice", enabled: true },
              { id: "image", enabled: true },
              { id: "render", enabled: true },
              { id: "upload", enabled: true },
              { id: "publish", enabled: true }
            ]
          });
        }
        console.log(`[EngineDiscovery] Registered ${templates.length} custom templates from custom-templates.json`);
      }
    } catch (e: any) {
      console.warn(`[EngineDiscovery] Failed to load custom templates:`, e.message);
    }
  }

  registerDynamicEngine(manifest: WorkflowManifest & { prompt?: string; sceneRules?: string }): void {
    // 1. Register prompt memory mapping
    if (manifest.prompt) {
      PromptRegistry.registerMemoryPrompt(`hook:${manifest.id}`, manifest.prompt);
    }
    if (manifest.sceneRules) {
      PromptRegistry.registerMemoryPrompt(`scene:${manifest.id}`, manifest.sceneRules);
    }

    // 2. Register with WorkflowLoader
    WorkflowLoader.register(manifest);

    // 3. Add to discovered engines list
    if (!this.discovered.includes(manifest.id)) {
      this.discovered.push(manifest.id);
    }

    // 4. Save to data/custom-engines.json persistently
    try {
      const dataDir = path.resolve(process.cwd(), "data");
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      const filePath = path.join(dataDir, "custom-engines.json");
      let engines = [];
      if (fs.existsSync(filePath)) {
        engines = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      }
      // Remove any existing duplicate engine definition
      engines = engines.filter((e: any) => e.id !== manifest.id);
      engines.push({
        id: manifest.id,
        name: manifest.name,
        version: manifest.version || "1.0",
        renderProfile: manifest.renderProfile || "FAST_QUIZ",
        prompt: manifest.prompt,
        sceneRules: manifest.sceneRules,
        steps: manifest.steps,
        configuration: manifest.configuration,
        contracts: manifest.contracts
      });
      fs.writeFileSync(filePath, JSON.stringify(engines, null, 2), "utf-8");
      console.log(`[EngineDiscovery] Saved dynamic engine "${manifest.id}" to custom-engines.json`);
    } catch (e: any) {
      console.error(`[EngineDiscovery] Failed to save custom engine file:`, e.message);
    }
  }

  registerDynamicTemplate(template: any): void {
    if (template.prompt) {
      PromptRegistry.registerMemoryPrompt(`hook:${template.id}`, template.prompt);
    }
    
    WorkflowLoader.register({
      id: template.id,
      name: template.name,
      version: template.version || "1.0",
      renderProfile: template.renderProfile || "FAST_SHORTS",
      hookPromptSlug: `hook:${template.id}`,
      steps: [
        { id: "script", enabled: true },
        { id: "critic", enabled: true, approvalRequired: false },
        { id: "scene", enabled: true },
        { id: "voice", enabled: true },
        { id: "image", enabled: true },
        { id: "render", enabled: true },
        { id: "upload", enabled: true },
        { id: "publish", enabled: true }
      ]
    });

    try {
      const dataDir = path.resolve(process.cwd(), "data");
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      const filePath = path.join(dataDir, "custom-templates.json");
      let templates = [];
      if (fs.existsSync(filePath)) {
        templates = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      }
      templates = templates.filter((t: any) => t.id !== template.id);
      templates.push(template);
      fs.writeFileSync(filePath, JSON.stringify(templates, null, 2), "utf-8");
      console.log(`[EngineDiscovery] Saved dynamic template "${template.id}" to custom-templates.json`);
    } catch (e: any) {
      console.error(`[EngineDiscovery] Failed to save custom template file:`, e.message);
    }
  }

  deleteDynamicTemplate(id: string): void {
    PromptRegistry.deleteMemoryPrompt(`hook:${id}`);
    try {
      const dataDir = path.resolve(process.cwd(), "data");
      const filePath = path.join(dataDir, "custom-templates.json");
      if (fs.existsSync(filePath)) {
        let templates = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        templates = templates.filter((t: any) => t.id !== id);
        fs.writeFileSync(filePath, JSON.stringify(templates, null, 2), "utf-8");
        console.log(`[EngineDiscovery] Deleted template "${id}" from custom-templates.json`);
      }
    } catch (e: any) {
      console.error(`[EngineDiscovery] Failed to delete custom template:`, e.message);
    }
  }

  deleteDynamicEngine(id: string): void {
    PromptRegistry.deleteMemoryPrompt(`hook:${id}`);
    PromptRegistry.deleteMemoryPrompt(`scene:${id}`);
    this.discovered = this.discovered.filter((d) => d !== id);
    try {
      const dataDir = path.resolve(process.cwd(), "data");
      const filePath = path.join(dataDir, "custom-engines.json");
      if (fs.existsSync(filePath)) {
        let engines = JSON.parse(fs.readFileSync(filePath, "utf-8"));
        engines = engines.filter((e: any) => e.id !== id);
        fs.writeFileSync(filePath, JSON.stringify(engines, null, 2), "utf-8");
        console.log(`[EngineDiscovery] Deleted engine "${id}" from custom-engines.json`);
      }
    } catch (e: any) {
      console.error(`[EngineDiscovery] Failed to delete custom engine:`, e.message);
    }
  }
}

export const EngineDiscovery = new EngineDiscoveryClass();
