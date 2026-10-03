import { hookScoreAgent } from "../agents/hook-score-agent";
import { sceneQualityAgent } from "../agents/scene-quality-agent";
import { metadataAgent } from "../agents/metadata-agent";
import { thumbnailAgent } from "../agents/thumbnail-agent";
import { findSimilarTopic } from "../rag/topic-memory";
import type { TreasuryModelExecutionContext } from "../ai/provider";

export type ContentPipelineInput = {
  topic: string;
  script: string;
  hook: string;
  scenes: Array<{ text: string; imagePrompt: string }>;
  hashtags?: string[];
  provider?: any;
  treasuryContext?: TreasuryModelExecutionContext;
};

export type ValidateContentResult = {
  approved: boolean;
  score: number;
  errors: string[];
  warnings: string[];

  hookScore?: number;
  sceneQualityScore?: number;
  topicSimilarity?: number;
  thumbnailReady?: boolean;
  metadataTitle?: string;
};

function isGenericTitle(title: string) {
  const t = title.toLowerCase();
  const badPhrases = [
    "consistency tips",
    "consistency",
    "tips",
    "how to",
    "guide",
    "advice",
  ];
  if (t.length < 18) return true;
  if (badPhrases.some((p) => t === p || t.startsWith(p))) return true;
  return false;
}

export async function validateContent(input: ContentPipelineInput): Promise<ValidateContentResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Hook score
  const hookScoreOut = await hookScoreAgent({ hook: input.hook, provider: input.provider, treasuryContext: input.treasuryContext });
  const hookScore = hookScoreOut.score;
  if (hookScore < 7) errors.push(`Hook score ${hookScore} < 7`);

  // Scene quality: average over scenes (reject if average < 7)
  const sceneScores: number[] = [];
  for (const s of input.scenes ?? []) {
    const out = await sceneQualityAgent({ scene: s, provider: input.provider, treasuryContext: input.treasuryContext });
    sceneScores.push(out.score);
  }
  const sceneQualityScore = sceneScores.length
    ? Math.round((sceneScores.reduce((a, b) => a + b, 0) / sceneScores.length) * 10) / 10
    : 0;

  if (sceneQualityScore < 7) errors.push(`Scene quality score ${sceneQualityScore} < 7`);

  // Metadata + thumbnail
  const meta = await metadataAgent({ topic: input.topic, script: input.script, provider: input.provider, treasuryContext: input.treasuryContext });
  const thumb = await thumbnailAgent({ topic: input.topic, script: input.script, provider: input.provider, treasuryContext: input.treasuryContext });

  if (!meta.hashtags?.length) errors.push("Empty hashtags");
  if (meta.hashtags.length < 5) errors.push("Hashtags must be 5–10 items");
  if (isGenericTitle(meta.title)) errors.push("Title too generic");

  // Topic similarity / alignment
  const similar = findSimilarTopic({
    topic: input.topic,
    hook: input.hook,
    title: meta.title,
    threshold: 0.35,
  });
  const bestSimilarity = similar[0]?.similarity ?? 0;

  // Preserve existing duplicate/near-duplicate reject (helps quality).
  if (bestSimilarity >= 0.95) {
    errors.push(
      `Duplicate/near-duplicate topic detected (similarity ${bestSimilarity.toFixed(2)})`
    );
  }

  // Thumbnail ready (hard requirement for this task)
  const thumbnailReady = !!thumb.thumbnailPrompt && !!thumb.headlineText;
  if (!thumbnailReady) errors.push("Thumbnail not ready (missing prompt/headline)");

  // Score aggregation
  const score = Math.max(0, Math.round((hookScore * 0.45 + sceneQualityScore * 0.45 + (thumbnailReady ? 10 : 0) * 0.1) * 10) / 10);

  return {
    approved: errors.length === 0,
    score,
    errors,
    warnings,
    hookScore,
    sceneQualityScore,
    topicSimilarity: bestSimilarity,
    thumbnailReady,
    metadataTitle: meta.title,
  };
}

