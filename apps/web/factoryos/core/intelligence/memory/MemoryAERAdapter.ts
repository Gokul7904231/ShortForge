import { AEREngine, type AERAssessment, type AERAssessmentInput } from "../epistemic/AEREngine";
import type { EpistemicFact, EpistemicImpact, EpistemicBudget } from "../epistemic/EpistemicContracts";
import type { MemoryRecallResult } from "./MemorySemanticsContracts";

export interface MemoryAERAdapterInput {
  readonly contextSeed: string;
  readonly recall: MemoryRecallResult;
  readonly impact?: EpistemicImpact;
  readonly budget: EpistemicBudget;
  readonly routing?: AERAssessmentInput["routing"];
}

export class MemoryAERAdapter {
  public constructor(private readonly engine = new AEREngine()) {}

  public assess(input: MemoryAERAdapterInput): AERAssessment {
    const known: EpistemicFact[] = input.recall.items.flatMap((item) => {
      if (item.verificationState === "DISPUTED" || item.verificationState === "UNVERIFIED") {
        return [];
      }
      return [{
        factId: "memory:" + item.memoryId,
        statement: item.content,
        sourceRefs: [...item.evidenceRefs, "memory:" + item.memoryId],
        status:
          item.verificationState === "VERIFIED"
            ? "CONFIRMED" as const
            : item.verificationState === "INFERRED"
              ? "INFERRED" as const
              : "SUPPORTED" as const,
      }];
    });

    const evidenceRefs = [
      ...new Set(input.recall.items.flatMap((item) => item.evidenceRefs)),
    ].sort();

    return this.engine.assess({
      contextSeed: input.contextSeed,
      known,
      evidenceRefs,
      impact: input.impact,
      budget: input.budget,
      routing: input.routing,
    });
  }
}
