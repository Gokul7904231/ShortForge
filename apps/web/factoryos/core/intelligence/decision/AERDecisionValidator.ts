/**
 * ShortForge / FactoryOS — AER-Core output validator.
 *
 * Model output is untrusted data. Validation never invents a missing answer,
 * probability, score, or confidence.
 */

import type {
  ChoiceQuestion,
  DecisionAnswer,
  DecisionQuestion,
  NoulQuestion,
  ScoreQuestion,
} from "./DecisionContracts";

function validUnitInterval(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
  );
}

function selectedValue(answer: DecisionAnswer): unknown {
  if (answer.type === "NOUL") return answer.value;
  if (answer.type === "CHOICE") return answer.selected;
  return answer.selectedLevel;
}

export function validateAERCoreAnswer(
  question: DecisionQuestion,
  answer: DecisionAnswer,
): string | undefined {
  if (answer.questionId !== question.id) return "ANSWER_QUESTION_MISMATCH";
  if (answer.type !== question.type) return "ANSWER_TYPE_MISMATCH";
  if (!validUnitInterval(answer.confidence)) return "INVALID_CONFIDENCE";
  if (answer.status && answer.status !== "VALID") return "MODEL_REPORTED_NONVALID_STATUS";

  // Narrow the answer union by its own discriminator. Equality with a separate
  // question discriminator is not sufficient for TypeScript control-flow narrowing.
  switch (answer.type) {
    case "NOUL": {
      const q = question as NoulQuestion;
      if (!validUnitInterval(answer.probabilityTrue)) return "INVALID_PROBABILITY";
      if (answer.value !== (answer.probabilityTrue >= (q.threshold ?? 0.5))) {
        return "VALUE_PROBABILITY_MISMATCH";
      }
      return undefined;
    }
    case "CHOICE": {
      const q = question as ChoiceQuestion;
      if (!q.options.includes(answer.selected)) return "INVALID_ENUM";
      const keys = Object.keys(answer.probabilities);
      if (keys.length !== q.options.length) return "INVALID_DISTRIBUTION";
      for (const option of q.options) {
        if (!validUnitInterval(answer.probabilities[option])) return "INVALID_DISTRIBUTION";
      }
      if (keys.some((key) => !q.options.includes(key))) return "INVALID_DISTRIBUTION";
      const probabilities = Object.values(answer.probabilities);
      const sum = probabilities.reduce((total, value) => total + value, 0);
      if (Math.abs(sum - 1) > 0.02) return "INVALID_DISTRIBUTION";
      const highest = Math.max(...probabilities);
      if (answer.probabilities[answer.selected] + 0.02 < highest) {
        return "SELECTED_NOT_TOP_PROBABILITY";
      }
      return undefined;
    }
    case "SCORE": {
      const q = question as ScoreQuestion;
      const declaredLevels = new Set(q.rubric.map((level) => level.level));
      if (!declaredLevels.has(answer.selectedLevel)) return "INVALID_RUBRIC_LEVEL";
      if (!validUnitInterval(answer.score)) return "INVALID_SCORE";
      const distributionKeys = Object.keys(answer.distribution).map(Number);
      if (
        distributionKeys.length !== q.rubric.length ||
        distributionKeys.some((level) => !declaredLevels.has(level))
      ) return "INVALID_DISTRIBUTION";
      const probabilities = Object.values(answer.distribution);
      if (probabilities.some((probability) => !validUnitInterval(probability))) {
        return "INVALID_DISTRIBUTION";
      }
      const sum = probabilities.reduce((total, value) => total + value, 0);
      if (Math.abs(sum - 1) > 0.02) return "INVALID_DISTRIBUTION";
      return undefined;
    }
  }
}
export function validateAERCoreBatch(
  questions: readonly DecisionQuestion[],
  answers: readonly DecisionAnswer[],
): string[] {
  const byId = new Map<string, DecisionAnswer>();
  const errors: string[] = [];

  for (const answer of answers) {
    if (byId.has(answer.questionId)) {
      errors.push(
        answer.questionId + ":DUPLICATE_ANSWER",
      );
      continue;
    }
    byId.set(answer.questionId, answer);
  }

  const expected = new Set(
    questions.map((question) => question.id),
  );

  for (const answer of answers) {
    if (!expected.has(answer.questionId)) {
      errors.push(
        answer.questionId + ":FOREIGN_ANSWER",
      );
    }
  }

  for (const question of questions) {
    const answer = byId.get(question.id);
    if (!answer) {
      errors.push(question.id + ":MISSING_ANSWER");
      continue;
    }

    const error = validateAERCoreAnswer(
      question,
      answer,
    );
    if (error) {
      errors.push(question.id + ":" + error);
    }
  }

  // Keep the helper intentionally value-free; no fallback decision is created.
  void selectedValue;
  return errors;
}
