// VisualAssetManager — Unified Asset Pipeline & Concurrent Retrieval (Refreshed)
import fs from "fs";
import path from "path";

function getSharp() {
  try {
    const pkg = "sharp";
    return require(pkg);
  } catch {
    return null;
  }
}
import { getStorageProvider } from "./StorageProvider";
import { AssetCurator } from "./AssetCurator";
import { VisualPackBuilder } from "./VisualPackBuilder";
import { db } from "../firebase-admin";
import { VisualPipeline } from "./VisualPipeline";
import { VisualContext, PipelineHistory } from "./VisualIntelligenceTypes";
import type { TreasuryModelExecutionContext } from "../../ai/provider";

export interface CacheEntry {
  key: string;
  filePath: string;
  sizeBytes: number;
  lastUsed: number;
  usageCount: number;
}

export interface AssetMetadata {
  storageKey: string;
  dhash: string;
  sha256: string;
  license: string;
  author: string;
  sourceUrl: string;
  attributionRequired: boolean;
  qualityScore: number;
  tags: string[];
  visualPackage?: any;
}

export class VisualIntelligence {
  static async determineCategoryAndTags(
    text: string,
    topic: string
  ): Promise<{ category: string; tags: string[] }> {
    const textLower = text.toLowerCase();
    let category = "Landmarks";
    const tags: string[] = [topic.toLowerCase()];

    if (textLower.includes("city") || textLower.includes("capital") || textLower.includes("tokyo") || textLower.includes("london") || textLower.includes("delhi") || textLower.includes("paris") || textLower.includes("berlin") || textLower.includes("urban") || textLower.includes("street")) {
      category = "Cities";
      tags.push("city", "urban", "skyline");
    } else if (textLower.includes("mountain") || textLower.includes("river") || textLower.includes("lake") || textLower.includes("nature") || textLower.includes("forest") || textLower.includes("ocean") || textLower.includes("sea") || textLower.includes("scenic")) {
      category = "Nature";
      tags.push("nature", "scenic", "landscape");
    } else if (textLower.includes("food") || textLower.includes("sushi") || textLower.includes("curry") || textLower.includes("pizza") || textLower.includes("cuisine") || textLower.includes("dish") || textLower.includes("cook")) {
      category = "Food";
      tags.push("food", "dish", "cuisine");
    } else if (textLower.includes("culture") || textLower.includes("festival") || textLower.includes("traditional") || textLower.includes("kimono") || textLower.includes("dance")) {
      category = "Culture";
      tags.push("culture", "tradition", "festival");
    } else if (textLower.includes("flag") || textLower.includes("banner")) {
      category = "Flags";
      tags.push("flag", "national");
    } else if (textLower.includes("map") || textLower.includes("border") || textLower.includes("geography")) {
      category = "Maps";
      tags.push("map", "geography");
    } else if (textLower.includes("architecture") || textLower.includes("temple") || textLower.includes("shrine") || textLower.includes("castle") || textLower.includes("palace") || textLower.includes("building")) {
      category = "Architecture";
      tags.push("architecture", "building");
    } else if (textLower.includes("landmark") || textLower.includes("monument") || textLower.includes("tower") || textLower.includes("statue")) {
      category = "Landmarks";
      tags.push("landmark", "monument");
    } else if (textLower.includes("travel") || textLower.includes("tourism") || textLower.includes("visit")) {
      category = "Travel";
      tags.push("travel", "tourism");
    }

    return { category, tags };
  }
}

class VisualAssetManagerClass {
  private cacheDir = path.resolve(process.cwd(), "data", "visual-assets-cache");
  private cacheIndexFile = path.join(this.cacheDir, "cache_index.json");
  private cacheMap = new Map<string, CacheEntry>();
  private storage = getStorageProvider();
  private pipeline = new VisualPipeline();

  private metrics = {
    cacheHits: 0,
    cacheMisses: 0,
    b2Reads: 0,
    openverseDownloads: 0,
    wikimediaDownloads: 0,
    aiFallbacks: 0,
    totalRetrievalTimeMs: 0,
    totalRequests: 0,
  };

  constructor() {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
    this.loadCacheIndex();
    this.prewarmHottestTopics();
  }

  private loadCacheIndex() {
    if (fs.existsSync(this.cacheIndexFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.cacheIndexFile, "utf8"));
        for (const entry of data) {
          this.cacheMap.set(entry.key, entry);
        }
      } catch (err: any) {
        console.warn("[VisualAssetManager] Failed to load cache index:", err.message);
      }
    }
  }

  private saveCacheIndex() {
    try {
      const data = Array.from(this.cacheMap.values());
      fs.writeFileSync(this.cacheIndexFile, JSON.stringify(data, null, 2), "utf8");
    } catch (err: any) {
      console.error("[VisualAssetManager] Failed to save cache index:", err.message);
    }
  }

  private async prewarmHottestTopics() {
    const hotCountries = ["United States", "United Kingdom", "India", "Japan"];
    console.log("[VisualAssetManager] Background prewarming triggered for:", hotCountries.join(", "));
    const builder = new VisualPackBuilder();
    
    (async () => {
      for (const country of hotCountries) {
        try {
          await builder.buildPack(country, "Landmarks").catch(() => {});
          await builder.buildPack(country, "Cities").catch(() => {});
        } catch {}
      }
      console.log("[VisualAssetManager] Background prewarming complete.");
    })();
  }

  async getVisualPack(params: {
    topic: string;
    questions: any[];
    style?: string;
    treasuryModelContext?: TreasuryModelExecutionContext;
  }): Promise<Array<{ path: string; metadata: AssetMetadata }>> {
    const startTime = Date.now();
    this.metrics.totalRequests++;

    const numQuestions = params.questions.length;
    const results: Array<{ path: string; metadata: AssetMetadata }> = [];

    const sharedHistory: PipelineHistory = {
      recentAssets: [],
      recentColors: [],
      recentProviders: [],
      recentLayouts: [],
      recentTopics: [],
      recentTags: [],
      recentDhashes: [],
      recentAuthors: [],
    };

    // 1. Build main query specs: 1 Hook + 1 per Question + 1 Outro
    const mainSpecs: Array<{ mainIndex: number; text: string; role: "hook" | "read" | "outro" }> = [];
    mainSpecs.push({ mainIndex: 0, text: `Topic Hook for ${params.topic}`, role: "hook" });
    params.questions.forEach((q, idx) => {
      mainSpecs.push({ mainIndex: idx + 1, text: `${q.question} ${params.topic}`, role: "read" });
    });
    mainSpecs.push({ mainIndex: numQuestions + 1, text: `Outro card for topic ${params.topic}`, role: "outro" });

    // Pre-fetch candidate pool
    const topicPoolCandidates: any[] = [];
    try {
      console.log(`[VisualAssetManager] Pre-fetching unified topic asset pool for: ${params.topic}`);
      const { ProviderFramework } = await import("./ProviderFramework");
      const { VisualPolicyEngine } = await import("./VisualPolicyEngine");
      
      const dummyContext: VisualContext = {
        jobId: `job_${startTime}_prewarm`,
        sceneIndex: 0,
        sceneText: `Topic query landmarks culture travel nature cities food for ${params.topic}`,
        topic: params.topic,
        role: "read",
        treasuryModelContext: params.treasuryModelContext,
        candidates: [],
        history: sharedHistory,
        metrics: {},
        config: {
          providerPriority: ["wikimedia", "openverse"],
          styleName: "quiz",
          weights: { relevance: 0.5, quality: 0.5, portrait: 0.0, license: 0.0, diversity: 0.0, usage: 0.0 }
        }
      };
      
      const providerFramework = new ProviderFramework();
      await providerFramework.run(dummyContext);
      
      const policyEngine = new VisualPolicyEngine();
      await policyEngine.run(dummyContext);
      
      topicPoolCandidates.push(...dummyContext.candidates);
      console.log(`[VisualAssetManager] Unified topic asset pool pre-fetched successfully: ${topicPoolCandidates.length} vetted candidates.`);
    } catch (err: any) {
      console.warn(`[VisualAssetManager] Pre-fetching unified topic asset pool failed: ${err.message}`);
    }

    const seenHashes = new Set<string>();

    const fetchSinglePackage = async (spec: { mainIndex: number; text: string; role: any }) => {
      let uniqueFound = false;
      let attempts = 0;
      let finalPackage: any = null;

      while (attempts < 2 && !uniqueFound) {
        attempts++;
        try {
          const queryText = spec.text + (attempts > 1 ? ` variant ${attempts}` : "");
          const context: VisualContext = {
            jobId: `job_${startTime}`,
            sceneIndex: spec.mainIndex,
            sceneText: queryText,
            topic: params.topic,
            role: spec.role,
            treasuryModelContext: params.treasuryModelContext,
            candidates: [...topicPoolCandidates],
            history: sharedHistory,
            metrics: {},
            config: {
              providerPriority: ["wikimedia", "openverse"],
              styleName: (params.style as any) || "quiz",
              weights: {
                relevance: 0.35,
                quality: 0.2,
                portrait: 0.15,
                license: 0.15,
                diversity: 0.1,
                usage: 0.05,
              },
            },
          };

          const visualPackage = await this.pipeline.run(context);
          const imgPath = visualPackage.background.path;
          
          if (fs.existsSync(imgPath)) {
            const sharpMod = getSharp();
            let w = 1080;
            let h = 1920;
            if (sharpMod) {
              const meta = await sharpMod(imgPath).metadata();
              w = meta.width || 0;
              h = meta.height || 0;
            }
            const isPortrait = h > w;
            const aspect = w / (h || 1);
            const is916 = aspect >= 0.5 && aspect <= 0.65;

            if (w >= 720 && h >= 1280 && (isPortrait || is916)) {
              const hash = visualPackage.background.sha256;
              if (!seenHashes.has(hash)) {
                seenHashes.add(hash);
                finalPackage = visualPackage;
                uniqueFound = true;
                break;
              }
            }
          }
        } catch (err: any) {
          console.warn(`[VisualAssetManager] Fetch attempt ${attempts} failed for ${spec.text}: ${err.message}`);
        }
      }

      if (!uniqueFound || !finalPackage) {
        try {
          const context: VisualContext = {
            jobId: `job_${startTime}`,
            sceneIndex: spec.mainIndex,
            sceneText: spec.text,
            topic: params.topic,
            role: spec.role,
            treasuryModelContext: params.treasuryModelContext,
            candidates: [],
            history: sharedHistory,
            metrics: {},
            config: {
              providerPriority: ["wikimedia", "openverse"],
              styleName: (params.style as any) || "quiz",
              weights: { relevance: 0, quality: 0, portrait: 0, license: 0, diversity: 0, usage: 0 }
            }
          };
          finalPackage = await this.pipeline.run(context);
        } catch (err: any) {
          const fallbackPath = path.join(this.cacheDir, "fallback_solid.jpg");
          if (!fs.existsSync(fallbackPath)) {
            const sharpMod = getSharp();
            if (sharpMod) {
              await sharpMod({
                create: { width: 1080, height: 1920, channels: 3, background: { r: 15, g: 23, b: 42 } },
              }).jpeg({ quality: 85 }).toFile(fallbackPath);
            } else {
              fs.writeFileSync(fallbackPath, Buffer.from(""));
            }
          }
          finalPackage = {
            jobId: `job_${startTime}`,
            sceneIndex: spec.mainIndex,
            background: {
              path: fallbackPath,
              sha256: `fallback_${spec.mainIndex}`,
              credits: "ShortForge",
              qualityScore: 8.0,
            },
            composition: { elements: [] },
            style: { name: (params.style as any) || "quiz" },
            metadata: {
              intent: { category: "Landmarks", entities: [] },
              evaluation: { backgroundScore: 8.0 },
              debug: { metrics: { totalPipelineTime: 100 } }
            }
          };
        }
      }

      return finalPackage;
    };

    const mainPackages = await Promise.all(mainSpecs.map(spec => fetchSinglePackage(spec)));
    const hookPkg = mainPackages[0];
    const outroPkg = mainPackages[mainPackages.length - 1];
    const questionPkgs = mainPackages.slice(1, mainPackages.length - 1);

    // [0] = Hook
    results.push({
      path: hookPkg.background.path,
      metadata: {
        storageKey: `local://${hookPkg.background.path}`,
        dhash: "",
        sha256: hookPkg.background.sha256 || "hook",
        license: "Public",
        author: hookPkg.background.credits || "ShortForge",
        sourceUrl: hookPkg.background.credits || "",
        attributionRequired: false,
        qualityScore: hookPkg.metadata?.evaluation?.backgroundScore ?? 8.5,
        tags: [params.topic],
        visualPackage: hookPkg,
      }
    });

    // 4 sub-phases per question
    params.questions.forEach((_q, idx) => {
      const pkg = questionPkgs[idx] || hookPkg;
      for (let sub = 0; sub < 4; sub++) {
        results.push({
          path: pkg.background.path,
          metadata: {
            storageKey: `local://${pkg.background.path}`,
            dhash: "",
            sha256: pkg.background.sha256 || `q_${idx}_${sub}`,
            license: "Public",
            author: pkg.background.credits || "ShortForge",
            sourceUrl: pkg.background.credits || "",
            attributionRequired: false,
            qualityScore: pkg.metadata?.evaluation?.backgroundScore ?? 8.5,
            tags: [params.topic],
            visualPackage: pkg,
          }
        });
      }
    });

    // [Last] = Outro
    results.push({
      path: outroPkg.background.path,
      metadata: {
        storageKey: `local://${outroPkg.background.path}`,
        dhash: "",
        sha256: outroPkg.background.sha256 || "outro",
        license: "Public",
        author: outroPkg.background.credits || "ShortForge",
        sourceUrl: outroPkg.background.credits || "",
        attributionRequired: false,
        qualityScore: outroPkg.metadata?.evaluation?.backgroundScore ?? 8.5,
        tags: [params.topic],
        visualPackage: outroPkg,
      }
    });

    this.metrics.totalRetrievalTimeMs += Date.now() - startTime;
    return results;
  }

  getMetrics() {
    const hits = this.metrics.cacheHits;
    const misses = this.metrics.cacheMisses;
    const total = hits + misses;
    const hitRate = total > 0 ? parseFloat(((hits / total) * 100).toFixed(1)) : 100;

    return {
      ...this.metrics,
      cacheHitRate: `${hitRate}%`,
    };
  }

  async saveDebugReport(jobId: string, visualPack: any[]) {
    const debugDir = path.resolve(process.cwd(), "data", "debug", `video-${jobId}`);
    if (!fs.existsSync(debugDir)) {
      fs.mkdirSync(debugDir, { recursive: true });
    }

    const reportScenes: any[] = [];

    visualPack.forEach((item, index) => {
      if (!item) return;
      const metadata = item.metadata || {};
      const pkg = metadata.visualPackage;
      if (!pkg || !pkg.composition || !pkg.composition.elements) {
        console.warn(`[VisualAssetManager] saveDebugReport: scene ${index} has no valid composition; skipping layout dump.`);
        if (pkg) {
          const sceneJsonPath = path.join(debugDir, `scene-${index}.json`);
          fs.writeFileSync(sceneJsonPath, JSON.stringify(pkg, null, 2), "utf8");
        }
        return;
      }

      const sceneJsonPath = path.join(debugDir, `scene-${index}.json`);
      fs.writeFileSync(sceneJsonPath, JSON.stringify(pkg, null, 2), "utf8");

      const assetsJsonPath = path.join(debugDir, `scene-${index}-selected-assets.json`);
      fs.writeFileSync(assetsJsonPath, JSON.stringify(pkg.background, null, 2), "utf8");

      const layoutJsonPath = path.join(debugDir, `scene-${index}-layout.json`);
      fs.writeFileSync(layoutJsonPath, JSON.stringify(pkg.composition.elements, null, 2), "utf8");

      reportScenes.push({
        sceneIndex: index,
        intent: pkg.metadata.intent,
        style: pkg.style.name,
        evaluation: pkg.metadata.evaluation,
        timing: pkg.metadata.debug.metrics,
      });
    });

    const reportPath = path.join(debugDir, "pipeline-report.json");
    const report = {
      jobId,
      timestamp: new Date().toISOString(),
      scenes: reportScenes,
    };
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
  }
}

export const VisualAssetManager = new VisualAssetManagerClass();
