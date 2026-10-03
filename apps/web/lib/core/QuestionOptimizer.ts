import { IntelligentRouter } from "../../ai/intelligent-router";
import type { TreasuryModelExecutionContext } from "../../ai/provider";

export class QuestionOptimizer {
  /**
   * Rewrites verbose quiz questions and options for punchy spoken delivery.
   * Prompts enforce strict limits on word count and creator-oriented style.
   */
  static async optimize(
    questions: any[],
    treasuryContext?: TreasuryModelExecutionContext,
  ): Promise<any[]> {
    console.log(`[QuestionOptimizer] Compressing script questions for spoken delivery...`);
    const optimized: any[] = [];

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      try {
        const result = await IntelligentRouter.routeExecute(
          {
            capability: "SCRIPT",
            subtask: "creativity",
            treasuryContext,
          },
          {
            prompt: `You are the Content Compression Agent for ShortsFactory. Rewrite the following quiz question and option array to be extremely concise, punchy, and natural for spoken voiceover.
Follow these strict creator rules:
1. Max 12 words for the question.
2. Max 3 words per option.
3. Preserve the exact correctness and meaning.
4. Remove any filler words.
5. Keep the correct answer index identical.

Original Question: "${q.question}"
Options: ${JSON.stringify(q.options)}
Correct Answer Index: ${q.answerIndex ?? 0}

Output JSON format only:
{
  "question": "punchy short question",
  "options": ["opt1", "opt2", "opt3", "opt4"]
}`,
            system: "You are a professional Shorts video editor script compressor. Output valid JSON only.",
            maxTokens: 250,
            temperature: 0.2
          }
        );

        let parsed: any;
        try {
          parsed = JSON.parse(typeof result === "string" ? result : JSON.stringify(result));
        } catch {
          // Fallback if LLM output had markdown formatting
          const cleanJson = String(result).replace(/```json/gi, "").replace(/```/g, "").trim();
          parsed = JSON.parse(cleanJson);
        }

        if (parsed.question && Array.isArray(parsed.options) && parsed.options.length === q.options.length) {
          console.log(`[QuestionOptimizer] Question ${i + 1} compressed successfully.`);
          optimized.push({
            ...q,
            question: parsed.question,
            options: parsed.options
          });
        } else {
          throw new Error("Invalid output structure.");
        }
      } catch (err: any) {
        console.warn(`[QuestionOptimizer] Optimization failed for question ${i + 1}: ${err.message}. Using original.`);
        optimized.push(q);
      }
    }
    return optimized;
  }
}
