import { providerFactory } from "../ai/factory";
import { LLMProvider, TreasuryModelExecutionContext } from "../ai/provider";
import { createSceneId } from "../lib/scene-utils";
import { HIGH_RETENTION_RULES } from "../prompts/retention-rules";
import { RETENTION_SCENE_RULES } from "../prompts/retention-scene-rules";

export type ScriptAgentInput = {
  topic: string;
  durationSeconds: number;
  style?: string;
  trend?: string;
  provider?: LLMProvider;
  apiKey?: string;
  contentType?: string;
  renderProfile?: string;
  topics?: Array<{ topicId: string; name: string; questionBudget: number }>;
  treasuryContext?: TreasuryModelExecutionContext;
  repairContext?: {
    failedClaims?: any[];
    sourceEvidence?: string[];
    sourceUrls?: string[];
    reasons?: string[];
  };
};

function safeJsonParse<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as T;
    } catch {
      return null;
    }
  }
}

async function generateMissingQuestions(
  llm: any,
  topic: string,
  style: string,
  missingCount: number,
  existingQuestions: any[]
): Promise<any[]> {
  const prompt = `We are building a quiz about topic: "${topic}". We already have the following ${existingQuestions.length} questions:
${existingQuestions.map((q, idx) => `${idx + 1}. "${q.question}"`).join("\n")}

Please generate exactly ${missingCount} MORE unique trivia quiz questions about "${topic}".
Each question MUST contain:
- "difficulty": "easy" or "medium" or "hard"
- "question": "Question text"
- "options": ["Option A", "Option B", "Option C"]
- "answer": "The correct option text exactly (must match one of the options)"
- "explanation": "A short 1-sentence educational explanation (max 15 words)"

Return JSON only in this format:
{
  "questions": [
    {
      "difficulty": "easy",
      "question": "...",
      "options": ["A", "B", "C"],
      "answer": "...",
      "explanation": "..."
    }
  ]
}`;

  try {
    const raw = await llm.generateText({
      prompt,
      system: "You are a quiz generation script engine. Output MUST be valid JSON only.",
      temperature: 0.7,
      maxTokens: 1000,
    });
    const cleanJson = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(cleanJson);
    if (parsed && Array.isArray(parsed.questions)) {
      return parsed.questions;
    }
  } catch (err) {
    console.error("[ScriptAgent] Failed to generate missing questions:", err);
  }
  return [];
}

export async function scriptAgent(
  input: ScriptAgentInput
): Promise<any> {
  const provider =
    input.provider ??
    (process.env.DEFAULT_LLM_PROVIDER as LLMProvider | undefined) ??
    "gemini";
  const llm = providerFactory(provider, { apiKey: input.apiKey, treasuryContext: input.treasuryContext });

  if (input.contentType === "QUIZ_SHORTS") {
    // Resolve expected question count based on mode
    let expectedCount = 6;
    const normProfile = String(input.renderProfile || "AUTO").toUpperCase();
    if (normProfile.includes("60") || normProfile === "FAST_QUIZ") {
      expectedCount = 6;
    } else if (normProfile.includes("120") || normProfile === "EXTENDED") {
      expectedCount = 8;
    } else {
      // Auto Mode: Resolve baseline based on style/difficulty, defaults to 6
      const diffLower = String(input.style || "medium").toLowerCase();
      if (diffLower.includes("easy")) {
        expectedCount = 5;
      } else if (diffLower.includes("hard")) {
        expectedCount = 7;
      } else {
        expectedCount = 6;
      }
    }

    console.log(`[ScriptAgent] Selected Expected Question Count: ${expectedCount} (Mode: ${normProfile})`);

    const repairDirective = input.repairContext
      ? `
CRITICAL FACTUAL REPAIR DIRECTIVE:
A previous draft was rejected for factual or ambiguity defects:
Reasons: ${input.repairContext.reasons?.join("; ") || "Factual grounding issue."}
External Evidence References:
${input.repairContext.sourceEvidence?.slice(0, 3).map((e: string, i: number) => `[Source ${i + 1}]: ${e}`).join("\n") || "Ensure factual consensus."}
Ensure all questions and answers are 100% verified against external factual consensus.`
      : "";

    const system =
      "You are a quiz generation script engine. Output MUST be valid JSON only. No markdown. No code blocks.";

    const topicAllocationDirective = input.topics && input.topics.length > 0
      ? `
MULTI-TOPIC QUESTION ALLOCATION:
You must distribute the questions across the following topic budgets:
${input.topics.map((t) => `- Topic: "${t.name}" (topicId: "${t.topicId}") -> generate ${t.questionBudget} question(s)`).join("\n")}
Every question in the "questions" array MUST include "topicId" set to the matching topic's topicId.`
      : "";

    const prompt = `
Generate exactly ${expectedCount} quiz questions optimized for YouTube Shorts / TikTok.
Topic: ${input.topic}
Style: ${input.style ?? "(not specified)"}
${repairDirective}
${topicAllocationDirective}

The hook must create strong curiosity and encourage completion. Use or adapt one of these high-performing hook templates:
- "Only 1% get Question ${expectedCount} right."
- "Most people fail Question ${expectedCount - 1}."
- "Let's see if you're smarter than the average person."
- "Can you score ${expectedCount}/${expectedCount}?"

Every question MUST contain exactly:
- "difficulty": "easy" or "medium" or "hard"
- "question": "Question text"
- "options": ["Option A text", "Option B text", "Option C text"]
- "answer": "The correct option text exactly (must match one of the options)"
- "explanation": "A short 1-sentence educational explanation or fun fact about the correct answer (max 15 words)"
- "topicId": "${input.topics && input.topics.length > 0 ? "one of the requested topicIds" : "topic"}"

Also generate automated social media metadata:
- "title": A high-converting curiosity title (e.g., "Most people fail Question ${expectedCount - 1}")
- "description": A short, search-optimized description summarizing the quiz.
- "hashtags": An array of 3-5 relevant hashtags.

Return JSON ONLY in this exact format:
{
  "contentType": "QUIZ_SHORTS",
  "hook": "...",
  "questions": [
    {
      "difficulty": "easy",
      "question": "...",
      "options": ["A", "B", "C"],
      "answer": "...",
      "explanation": "..."
    }
  ],
  "title": "...",
  "description": "...",
  "hashtags": ["...", "..."],
  "renderProfile": "${input.renderProfile || "AUTO"}",
  "estimatedDuration": 60
}
`;

    let attempts = 0;
    while (attempts < 3) {
      attempts++;
      try {
        const raw = await llm.generateText({
          prompt,
          system,
          temperature: 0.7,
          maxTokens: 1500,
        });

        const parsed = safeJsonParse<any>(raw);
        if (!parsed) continue;

        let parsedQuestions = parsed.questions || [];

        // Validate & Repair Loop
        if (parsedQuestions.length < expectedCount) {
          const missingCount = expectedCount - parsedQuestions.length;
          console.warn(`[ScriptAgent] Expected ${expectedCount} questions, but got ${parsedQuestions.length}. Regenerating ${missingCount} missing questions...`);
          const additional = await generateMissingQuestions(llm, input.topic, input.style || "", missingCount, parsedQuestions);
          parsedQuestions.push(...additional);
        }

        // Ensure exactly expectedCount
        parsedQuestions = parsedQuestions.slice(0, expectedCount);

        if (parsedQuestions.length !== expectedCount) {
          console.warn(`[ScriptAgent] Failed to repair questions count. Got ${parsedQuestions.length}/${expectedCount}. Retrying generation...`);
          continue;
        }

        let valid = true;
        const seen = new Set<string>();
        for (let i = 0; i < expectedCount; i++) {
          const q = parsedQuestions[i];
          if (!q || !q.question || !Array.isArray(q.options) || q.options.length < 2 || !q.answer || !q.difficulty || !q.explanation) {
            valid = false;
            break;
          }
          if (!q.options.includes(q.answer)) {
            valid = false;
            break;
          }
          const qText = q.question.trim().toLowerCase();
          if (seen.has(qText)) valid = false;
          seen.add(qText);
        }

        if (valid) {
          if (input.topics && input.topics.length > 0) {
            let assignedIdx = 0;
            for (const topic of input.topics) {
              for (let b = 0; b < topic.questionBudget; b++) {
                if (assignedIdx < parsedQuestions.length) {
                  parsedQuestions[assignedIdx].topicId = parsedQuestions[assignedIdx].topicId || topic.topicId;
                  parsedQuestions[assignedIdx].topicName = parsedQuestions[assignedIdx].topicName || topic.name;
                  assignedIdx++;
                }
              }
            }
          }
          parsed.questions = parsedQuestions;
          return parsed;
        }
      } catch (err) {
        console.error("[ScriptAgent Error]:", err);
      }
    }
    throw new Error(`ScriptAgent failed to generate a valid ${expectedCount}-question quiz script after 3 attempts.`);
  }

  // Fallback / legacy story script generation
  const scenesCount = Math.max(3, Math.min(10, Math.round(input.durationSeconds / 6)));
  const system =
    "You are a retention-first YouTube Shorts script engine. Output MUST be valid JSON only. No markdown.";

  const prompt = `
Generate a ${scenesCount}-scene Shorts script.
Topic: ${input.topic}
Style: ${input.style ?? "(not specified)"}
Return JSON only in this exact shape:
{"scenes":[{"contactText":"...","imagePrompt":"..."}]}
`;

  const raw = await llm.generateText({
    prompt,
    system,
    temperature: 0.7,
    maxTokens: 950,
  });

  const parsed = safeJsonParse<{
    scenes: Array<{ contactText: string; imagePrompt: string }>;
  }>(raw);

  if (!parsed?.scenes || !Array.isArray(parsed.scenes)) {
    throw new Error("ScriptAgent failed to parse model output as JSON.");
  }

  const scenes = parsed.scenes.slice(0, scenesCount).map((s) => ({
    id: createSceneId(),
    contactText: s.contactText,
    imagePrompt: s.imagePrompt,
  }));

  while (scenes.length < scenesCount) {
    scenes.push({
      id: createSceneId(),
      contactText: "(scene stub)",
      imagePrompt: "(image prompt stub)",
    });
  }

  return { scenes };
}
