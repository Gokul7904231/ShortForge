import { providerFactory } from "../ai/factory";
import { LLMProvider, TreasuryModelExecutionContext } from "../ai/provider";

export type QuizQuestion = {
  difficulty?: "easy" | "medium" | "hard";
  question: string;
  options: string[];
  answer?: string;
  answerIndex?: number;
  explanation?: string;
};

export type QuizCorrectorAgentInput = {
  topic: string;
  questions: QuizQuestion[];
  provider?: LLMProvider;
  treasuryContext?: TreasuryModelExecutionContext;
};

export type QuizCorrectorAgentOutput = {
  questions: QuizQuestion[];
  corrections: string[];
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

/**
 * Proofreads and corrects quiz questions/answers for spelling, grammar, and
 * consistency without altering their factual meaning or correct answer.
 * Runs as a final pass before rendering so on-screen text has no typos.
 */
export async function quizCorrectorAgent(
  input: QuizCorrectorAgentInput
): Promise<QuizCorrectorAgentOutput> {
  const provider =
    input.provider ??
    (process.env.DEFAULT_LLM_PROVIDER as LLMProvider | undefined) ??
    "gemini";

  const llm = providerFactory(provider, { apiKey: undefined, treasuryContext: input.treasuryContext });

  const system =
    "You are a meticulous proofreading editor for trivia quiz content. Output ONLY valid JSON. No markdown. No code blocks.";

  const prompt = `
Topic: ${input.topic}

Below is a list of quiz questions with their options, the correct answer, and an explanation.
Your job is to PROOFREAD and CORRECT spelling and grammar mistakes ONLY.

Strict rules:
- Fix spelling mistakes, typos, and obvious grammar errors in the question, every option, the answer, and the explanation.
- DO NOT change the factual meaning, numbers, names, or the intended correct answer.
- The "answer" field MUST remain exactly equal to one of the corrected "options" (case-insensitive match allowed). If the original answer text had a typo, correct it to exactly match the corrected option text.
- Keep "difficulty" as "easy", "medium", or "hard" (do not change its value).
- Keep casing/style consistent across options (all options same casing style).
- Preserve the original order of questions and options.
- Do not add, remove, merge, or rewrite questions.

Return ONLY JSON in this exact shape:
{
  "questions": [
    {
      "difficulty": "easy" | "medium" | "hard",
      "question": "corrected question text",
      "options": ["corrected option A", "corrected option B", "corrected option C"],
      "answer": "corrected correct option (must match one option exactly)",
      "explanation": "corrected explanation"
    }
  ],
  "corrections": ["short note of what was fixed in question 1", "..."]
}

Input questions:
${JSON.stringify(input.questions, null, 2)}
`;

  const raw = await llm.generateText({
    prompt,
    system,
    temperature: 0.1,
    maxTokens: 2000,
  });

  const parsed = safeJsonParse<{ questions?: QuizQuestion[]; corrections?: string[] }>(raw);

  if (!parsed || !Array.isArray(parsed.questions) || parsed.questions.length !== input.questions.length) {
    console.warn("[QuizCorrectorAgent] LLM returned invalid/partial output. Returning original questions.");
    return { questions: input.questions, corrections: [] };
  }

  const corrections = Array.isArray(parsed.corrections) ? parsed.corrections.map((c) => String(c)) : [];

  // Validation / fallback: ensure each corrected answer still matches an option.
  const corrected = parsed.questions.map((q, idx) => {
    const original = input.questions[idx];
    if (!q || !q.question || !Array.isArray(q.options) || q.options.length < 2) {
      return original;
    }
    const answer = q.answer ?? original.answer;
    const normalizedOptions = q.options.map((o) => String(o).trim().toLowerCase());
    const matches = normalizedOptions.includes(String(answer ?? "").trim().toLowerCase());
    if (!matches) {
      // Fallback: keep answer as the option the corrected answer text most likely meant,
      // otherwise restore the original answer/option pair.
      if (original.answer && q.options.includes(original.answer)) {
        return { ...q, answer: original.answer };
      }
      return original;
    }
    return { ...q, answer };
  });

  return { questions: corrected, corrections };
}
