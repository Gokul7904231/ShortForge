/**
 * FactoryOS Frontier v3 — ContextOS Architecture
 * Hierarchical context bounding: RETRIEVE -> FILTER -> BOUND -> EXECUTE
 * Manages WORKING, EPISODIC, KNOWLEDGE, and STRATEGIC memory layers.
 */

export interface ContextPackage {
  readonly missionId: string;
  readonly taskId: string;
  readonly workingContext: Record<string, unknown>;
  readonly episodicMemory: string[];
  readonly knowledgeItems: string[];
  readonly strategicDirectives: string[];
  readonly tokenCount: number;
  readonly packedAt: string;
}

export class ContextOS {
  private static MAX_CONTEXT_TOKENS = 4000;

  /**
   * Bounded Pipeline: RETRIEVE -> FILTER -> BOUND -> EXECUTE
   */
  static packageContext(params: {
    missionId: string;
    taskId: string;
    workingData: Record<string, unknown>;
    pastRuns?: string[];
    knowledgeHints?: string[];
    directives?: string[];
  }): ContextPackage {
    // 1. Filter and deduplicate
    const episodic = Array.from(new Set(params.pastRuns || [])).slice(-5);
    const knowledge = Array.from(new Set(params.knowledgeHints || [])).slice(-5);
    const directives = Array.from(new Set(params.directives || ["Enforce 9:16 vertical video", "Pacing 150wpm"]));

    // 2. Bound token size
    const rawContent = JSON.stringify(params.workingData) + episodic.join(" ") + knowledge.join(" ");
    const estimatedTokens = Math.round(rawContent.length / 4);

    return {
      missionId: params.missionId,
      taskId: params.taskId,
      workingContext: params.workingData,
      episodicMemory: episodic,
      knowledgeItems: knowledge,
      strategicDirectives: directives,
      tokenCount: Math.min(estimatedTokens, this.MAX_CONTEXT_TOKENS),
      packedAt: new Date().toISOString(),
    };
  }
}
