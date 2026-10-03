import getSafeDatabase, { SafeDatabase } from "../safe-sqlite";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { IntelligentRouter } from "../../ai/intelligent-router";
import { SceneIntent, VisualContext } from "./VisualIntelligenceTypes";
import type { TreasuryModelExecutionContext } from "../../ai/provider";

export class SceneIntentAnalyzer {
  private db: SafeDatabase;

  constructor() {
    const dbDir = path.resolve(process.cwd(), "data");
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    const dbPath = path.join(dbDir, "shortfactory.db");
    this.db = getSafeDatabase(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS scene_intent_cache (
        text_hash TEXT PRIMARY KEY,
        intent_json TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);
  }

  private getHash(text: string): string {
    return crypto.createHash("sha256").update(text.trim()).digest("hex");
  }

  async run(
    context: VisualContext,
    treasuryContext?: TreasuryModelExecutionContext,
  ): Promise<void> {
    const t0 = Date.now();
    const text = context.sceneText;
    const textHash = this.getHash(text);

    // 1. Check local SQLite cache first
    const cached = this.db.prepare("SELECT intent_json FROM scene_intent_cache WHERE text_hash = ?").get(textHash) as { intent_json: string } | undefined;
    if (cached) {
      console.log(`[SceneIntentAnalyzer] Intent cache hit for scene: "${text.slice(0, 60)}..."`);
      context.intent = JSON.parse(cached.intent_json);
      context.metrics.intentTime = Date.now() - t0;
      return;
    }

    console.log(`[SceneIntentAnalyzer] Intent cache miss. Querying LLM Analyzer for: "${text.slice(0, 60)}..."`);

    // 2. Perform LLM analysis
    const systemPrompt = `Analyze the given scene context text and output a JSON object describing what visuals are required.
Return ONLY valid JSON matching this schema exactly. Do not output markdown, reasoning, or triple backticks.

Schema:
{
  "topic": "The broad topic (e.g. Japan, Space, Cooking)",
  "category": "One of: Landmarks, Food, Culture, Nature, Cities, Maps, Flags, Architecture, Travel",
  "entities": ["list", "of", "important", "nouns/nouns phrases"],
  "emotion": "Dominant emotion (e.g. curiosity, excitement, awe, focus)",
  "visualStyle": "Style preference (e.g. scenic, dramatic, historical, modern, realistic)",
  "complexity": "simple", "medium", or "complex",
  "landmarks": ["Mount Fuji", "Tokyo Tower"],
  "people": ["Samurai", "Chef"],
  "countries": ["Japan"],
  "logos": ["Toyota"],
  "maps": ["Kanto Map"]
}`;

    let intent: SceneIntent;
    try {
      const llmResult = await IntelligentRouter.routeExecute(
        { capability: "SCRIPT" },
        {
          prompt: `Scene narration/text: "${text}"`,
          system: systemPrompt,
          treasuryContext,
        }
      );

      let cleanJson = String(llmResult).trim();
      // Remove any possible backtick wrappers
      if (cleanJson.startsWith("```")) {
        cleanJson = cleanJson.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
      }

      intent = JSON.parse(cleanJson);
    } catch (err: any) {
      console.warn(`[SceneIntentAnalyzer] LLM analysis failed: ${err.message}. Falling back to default heuristics.`);
      // Fast fallback heuristics
      intent = {
        topic: context.topic,
        category: "Landmarks",
        entities: [context.topic.toLowerCase()],
        emotion: "curiosity",
        visualStyle: "scenic",
        complexity: "simple",
        landmarks: [],
        people: [],
        countries: [context.topic],
        logos: [],
        maps: [],
      };
    }

    // 3. Save to cache
    this.db.prepare(`
      INSERT INTO scene_intent_cache (text_hash, intent_json, created_at)
      VALUES (?, ?, ?)
      ON CONFLICT(text_hash) DO UPDATE SET
        intent_json = excluded.intent_json,
        created_at = excluded.created_at
    `).run(textHash, JSON.stringify(intent), Date.now());

    context.intent = intent;
    context.metrics.intentTime = Date.now() - t0;
  }
}
