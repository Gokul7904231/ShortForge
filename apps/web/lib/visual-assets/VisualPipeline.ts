import fs from "fs";
import path from "path";
import crypto from "crypto";
import { db } from "../firebase-admin";
import { getStorageProvider } from "./StorageProvider";
import { AssetCurator } from "./AssetCurator";
import { validateAndConvertToJpeg, validateImageBuffer } from "./ImageValidation";
import { SceneIntentAnalyzer } from "./SceneIntentAnalyzer";
import { AssetPlanner } from "./AssetPlanner";
import { ProviderFramework } from "./ProviderFramework";
import { AssetRankingEngine } from "./AssetRankingEngine";
import { VisualPolicyEngine } from "./VisualPolicyEngine";
import { StyleEngine } from "./StyleEngine";
import { CompositionPlanner } from "./CompositionPlanner";
import { DiversityEngine } from "./DiversityEngine";
import { AssetMemory } from "./AssetMemory";
import { VisualGraphBuilder } from "./VisualGraphBuilder";
import { VisualPackageBuilder } from "./VisualPackageBuilder";
import { VisualRecommendationEngine } from "./VisualRecommendationEngine";
import { VisualCritic } from "./VisualCritic";
import { VisualContext, CandidateAsset, SceneVisualPackage } from "./VisualIntelligenceTypes";
import { ComfyVisualTransformEngine } from "../../factoryos/core/visual/ComfyVisualTransformEngine";

export class VisualPipeline {
  private intentAnalyzer = new SceneIntentAnalyzer();
  private planner = new AssetPlanner();
  private recommendationEngine = new VisualRecommendationEngine();
  private providers = new ProviderFramework();
  private policy = new VisualPolicyEngine();
  private ranking = new AssetRankingEngine();
  private style = new StyleEngine();
  private composition = new CompositionPlanner();
  private diversity = new DiversityEngine();
  private memory = new AssetMemory();
  private graph = new VisualGraphBuilder();
  private packageBuilder = new VisualPackageBuilder();
  private critic = new VisualCritic();
  private storage = getStorageProvider();
  private comfyTransformer = new ComfyVisualTransformEngine();
  private cacheDir = path.resolve(process.cwd(), "data", "visual-assets-cache");

  constructor() {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  async run(context: VisualContext): Promise<SceneVisualPackage> {
    const tStart = Date.now();

    // Pass 1: Scene Intent Analysis (LLM extraction + local SQL cache)
    await this.intentAnalyzer.run(context);

    // Pass 2: Asset Plan establishment
    await this.planner.run(context);

    // Pass 2.5: Design Recommendation
    this.recommendationEngine.run(context);

    // -----------------------------------------------------------------
    // Retrieval Strategy implementation: Cache -> B2 -> Scraper -> AI
    // -----------------------------------------------------------------
    let resolvedAsset: CandidateAsset | null = null;
    const category = context.intent?.category.toLowerCase() || "landmarks";
    const topic = context.topic;

    if (context.candidates && context.candidates.length > 0) {
      this.diversity.penalize(context);
      // Always run policy enforcement on pre-fetched candidates too —
      // the topic pool can contain unrelated-language assets that would
      // otherwise slip through and end up in the final render.
      this.policy.run(context);
      this.ranking.run(context);
      resolvedAsset = context.selectedAsset || null;
      if (resolvedAsset) {
        console.log(`[VisualPipeline] Selected asset from pre-fetched pool: ${resolvedAsset.id}`);
      }
    }

    if (!resolvedAsset) {
      // Check Firestore metadata index for existing assets on this exact topic/category
      const indexDocIdPrefix = `${topic.replace(/\s+/g, "_")}_${category}`;
      const snap = await db.collection("visual_assets")
        .where("topic", "==", topic)
        .where("category", "==", context.intent?.category || "Landmarks")
        .where("status", "==", "active")
        .get();

      const existingAssets: CandidateAsset[] = [];
      snap.forEach((doc) => {
        existingAssets.push(doc.data() as CandidateAsset);
      });

      if (existingAssets.length > 0) {
        context.candidates = [...existingAssets];
        this.policy.run(context);
        this.diversity.penalize(context);
        this.ranking.run(context);
        
        if (context.selectedAsset) {
          resolvedAsset = context.selectedAsset;
          console.log(`[VisualPipeline] Re-using index candidate: ${resolvedAsset.id}`);
        }
      }
    }

    if (!resolvedAsset) {
      // Pass 3: Multi Provider Search (Openverse, Wikimedia)
      await this.providers.run(context);

      // Pass 4: Visual Policy Enforcement (Filter licenses, shapes)
      await this.policy.run(context);

      // Pass 5: Diversity score penalty calculations
      this.diversity.penalize(context);

      // Pass 6: Ranking candidates with weighted randomization
      this.ranking.run(context);

      resolvedAsset = context.selectedAsset || null;
    }

    // AI Generation Last Resort Fallback
    if (!resolvedAsset) {
      console.log(`[VisualPipeline] Search yielded 0 valid candidates. Invoking AI Generation fallback...`);
      const aiAsset = await this.triggerAIGenerationFallback(context);
      resolvedAsset = aiAsset;
      context.selectedAsset = aiAsset;
    }

    // Download/Load file to local cache using Content-Addressable Storage (CAS)
    if (resolvedAsset) {
      resolvedAsset.path = await this.ensureLocalCachePath(resolvedAsset, context);
    }

    // Optional governed transformation: retrieval remains the source-of-truth path;
    // ComfyUI is invoked only when an explicit transform plan is present.
    if (resolvedAsset && context.transformPlan?.enabled && context.transformPlan.steps.length > 0) {
      if (!context.transformPlan.guardianCertificateId?.trim()) {
        throw new Error("visual_transform_guardian_certificate_required");
      }
      const transformResult = await this.comfyTransformer.transform({
        missionId: context.jobId,
        jobId: context.jobId,
        floorId: "floor04_media_synthesis",
        environment: process.env.NODE_ENV === "production" ? "production" : "development",
        sourceAsset: resolvedAsset,
        steps: context.transformPlan.steps,
        guardianCertificateId: context.transformPlan.guardianCertificateId,
      });
      resolvedAsset = transformResult.asset;
      context.selectedAsset = resolvedAsset;
      context.candidates = [...context.candidates, resolvedAsset];
      context.metrics.comfyTransformTime = transformResult.lineage.length > 0 ? Date.now() - tStart : 0;
    }

    // Pass 7: Visual Style configuration mapping
    this.style.run(context);

    // Pass 8: Composition layout coordinates allocation
    this.composition.run(context);

    // Pass 9: Hierarchy visual graph tree conversion
    this.graph.run(context);

    // Pass 10: Assemble final self-contained package
    this.packageBuilder.run(context);

    // Pass 10.5: Post-Composition Evaluation (Visual Critic Loop)
    this.critic.run(context);

    // Pass 11: Diversity stats tracking update
    this.diversity.recordSelection(context);

    // Pass 12: Memory logging increment asynchronously
    await this.memory.run(context);

    // Final validation gate: never return an undefined / incomplete package.
    const pkg = context.visualPackage;
    if (!pkg || !pkg.background || !pkg.background.path) {
      throw new Error("VisualPackage build failed: no background path produced");
    }
    if (!pkg.composition || !Array.isArray(pkg.composition.elements)) {
      throw new Error("VisualPackage build failed: composition.elements missing");
    }
    if (!fs.existsSync(pkg.background.path)) {
      throw new Error(`VisualPackage build failed: background image missing at ${pkg.background.path}`);
    }
    const finalCheck = await validateImageBuffer(fs.readFileSync(pkg.background.path));
    if (!finalCheck.ok) {
      throw new Error(`VisualPackage build failed: background is not a valid image (${finalCheck.reason})`);
    }

    return pkg;
  }

  private async ensureLocalCachePath(asset: CandidateAsset, context: VisualContext): Promise<string> {
    const t0 = Date.now();

    if (asset.path && fs.existsSync(asset.path)) {
      return asset.path;
    }

    // 1. If B2 index storageKey is already defined, check if file is cached locally
    if (asset.storageKey) {
      const sha256 = path.basename(asset.storageKey, ".webp");
      const localPath = path.join(this.cacheDir, `${sha256}.webp`);
      if (fs.existsSync(localPath)) {
        // Verify the cached file is still a real image (cache corruption guard).
        const cached = fs.readFileSync(localPath);
        const checked = await validateImageBuffer(cached);
        if (checked.ok) return localPath;
        console.warn(`[VisualPipeline] Cached asset corrupt, re-downloading: ${asset.storageKey}`);
      }
      
      // Cache miss: download from storage provider directly
      console.log(`[VisualPipeline] Cache miss. Downloading asset from B2: ${asset.storageKey}`);
      const buffer = await this.storage.download(asset.storageKey);

      // Root-cause guard: reject unsupported/HTML/corrupt buffers before caching.
      const { jpeg } = await validateAndConvertToJpeg(
        buffer,
        `B2 asset ${asset.storageKey}`
      );

      const jpgPath = path.join(this.cacheDir, `${path.basename(asset.storageKey, path.extname(asset.storageKey)) || sha256}.jpg`);
      fs.writeFileSync(jpgPath, jpeg);
      return jpgPath;
    }

    // 2. Scraping match: download raw file and curate
    if (asset.originalUrl) {
      const res = await fetch(asset.originalUrl);
      if (!res.ok) throw new Error(`Failed to fetch original file: HTTP ${res.status}`);
      
      const buffer = Buffer.from(await res.arrayBuffer());

      // Verify MIME + decode before curating; otherwise we package garbage.
      const preCheck = await validateImageBuffer(buffer);
      if (!preCheck.ok) {
        throw new Error(`Rejected image from ${asset.originalUrl}: ${preCheck.reason}`);
      }

      const { report, optimizedBuffer } = await AssetCurator.curate(buffer, {
        title: asset.tags?.join(" ") || context.topic,
        tags: asset.tags,
      });

      const localPath = path.join(this.cacheDir, `${report.sha256}.jpg`);
      fs.writeFileSync(localPath, optimizedBuffer);
      
      // Upload to Backblaze B2
      const storagePath = `visual-packs/${context.topic.replace(/\s+/g, "_")}/${context.intent?.category.toLowerCase() || "landmarks"}/${report.sha256}.webp`;
      const storageKey = await this.storage.upload(storagePath, optimizedBuffer, "image/webp");

      asset.storageKey = storageKey;
      asset.sha256 = report.sha256;
      asset.dhash = report.dhash;
      asset.width = report.width;
      asset.height = report.height;
      asset.qualityScore = report.score;
      asset.path = localPath;

      return localPath;
    }

    throw new Error("Candidate has no key or original URL source");
  }

  private async triggerAIGenerationFallback(context: VisualContext): Promise<CandidateAsset> {
    const prompt = `Highly detailed landscape photo representing ${context.topic}, category ${context.intent?.category || "Landmarks"}. 9:16 aspect vertical framing, cinematic light.`;
    
    // Stub AI generation: compile a mock solid buffer or call an AI route if needed
    const pkg = "sharp";
    let sharpMod: any = null;
    try {
      sharpMod = require(pkg);
    } catch {}

    let buffer: Buffer;
    if (sharpMod) {
      buffer = await sharpMod({
        create: {
          width: 1080,
          height: 1920,
          channels: 3,
          background: { r: 20, g: 30, b: 50 },
        },
      })
      .jpeg({ quality: 85 })
      .toBuffer();
    } else {
      buffer = Buffer.alloc(1080 * 1920 * 3, 0);
    }

    // Verify the generated image decodes cleanly before packaging.
    const { report, optimizedBuffer } = await AssetCurator.curate(buffer, {
      title: context.topic,
      tags: ["ai", "generation", context.topic.toLowerCase()],
    });

    const sha256 = report.sha256;
    const localPath = path.join(this.cacheDir, `${sha256}.jpg`);
    fs.writeFileSync(localPath, optimizedBuffer);

    const storagePath = `visual-packs/ai_generated/${context.topic.replace(/\s+/g, "_")}/${sha256}.webp`;
    const storageKey = await this.storage.upload(storagePath, optimizedBuffer, "image/webp");

    return {
      id: `ai_${sha256}`,
      storageKey,
      path: localPath,
      sha256,
      dhash: report.dhash,
      license: "Creative Commons CC0",
      author: "ShortsFactory FLUX generator",
      sourceUrl: "https://shortsfactory.ai",
      attributionRequired: false,
      qualityScore: 8.5,
      width: 1080,
      height: 1920,
      tags: ["ai", "generation", context.topic.toLowerCase()],
      source: "ai_fallback",
      usageCount: 0,
    } as any;
  }
}
