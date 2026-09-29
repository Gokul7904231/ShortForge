/**
 * FactoryOS bounded closed-loop execution contracts.
 *
 * The loop is intentionally generic: domain runtimes supply observation,
 * verification and bounded revision. Authority remains in the existing
 * Guardian / ActionGate boundaries.
 */

export type FloorLoopType =
  | "BOUNDED_FEEDBACK"
  | "COGNITIVE_EXECUTION"
  | "DETERMINISTIC_OPERATIONAL"
  | "VERIFICATION_REMEDIATION";

export type ClosedLoopTermination =
  | "COMPLETED"
  | "EXHAUSTED"
  | "ESCALATED"
  | "NO_PROGRESS";

export const MAX_CLOSED_LOOP_ITERATIONS = 8;

export interface ClosedLoopIteration<TOutput, TFeedback> {
  readonly iteration: number;
  readonly output: TOutput;
  readonly feedback: TFeedback;
  readonly fingerprint: string;
}

export interface BoundedFeedbackLoopResult<TOutput, TFeedback> {
  readonly output: TOutput;
  readonly termination: ClosedLoopTermination;
  readonly iterations: number;
  readonly history: readonly ClosedLoopIteration<TOutput, TFeedback>[];
}

export interface BoundedFeedbackLoopOptions<TOutput, TFeedback> {
  readonly initialOutput: TOutput;
  readonly maxIterations: number;
  readonly verify: (output: TOutput, iteration: number) => Promise<TFeedback>;
  readonly isSatisfied: (feedback: TFeedback) => boolean;
  readonly fingerprint: (output: TOutput) => string;
  readonly revise: (
    output: TOutput,
    feedback: TFeedback,
    iteration: number
  ) => Promise<TOutput | null>;
}

export async function runBoundedFeedbackLoop<TOutput, TFeedback>(
  options: BoundedFeedbackLoopOptions<TOutput, TFeedback>
): Promise<BoundedFeedbackLoopResult<TOutput, TFeedback>> {
  const requestedMaxIterations = Number(options.maxIterations);
  const maxIterations = Math.min(
    MAX_CLOSED_LOOP_ITERATIONS,
    Math.max(
      1,
      Number.isFinite(requestedMaxIterations)
        ? Math.floor(requestedMaxIterations)
        : MAX_CLOSED_LOOP_ITERATIONS
    )
  );
  let output = options.initialOutput;
  const history: ClosedLoopIteration<TOutput, TFeedback>[] = [];
  const seen = new Set<string>();

  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    const fingerprint = options.fingerprint(output);
    if (seen.has(fingerprint)) {
      return {
        output,
        termination: "NO_PROGRESS",
        iterations: iteration - 1,
        history: Object.freeze([...history]),
      };
    }
    seen.add(fingerprint);

    const feedback = await options.verify(output, iteration);
    history.push({ iteration, output, feedback, fingerprint });

    if (options.isSatisfied(feedback)) {
      return {
        output,
        termination: "COMPLETED",
        iterations: iteration,
        history: Object.freeze([...history]),
      };
    }

    if (iteration >= maxIterations) {
      return {
        output,
        termination: "EXHAUSTED",
        iterations: iteration,
        history: Object.freeze([...history]),
      };
    }

    const revised = await options.revise(output, feedback, iteration);
    if (!revised) {
      return {
        output,
        termination: "ESCALATED",
        iterations: iteration,
        history: Object.freeze([...history]),
      };
    }

    const revisedFingerprint = options.fingerprint(revised);
    if (revisedFingerprint === fingerprint) {
      return {
        output,
        termination: "NO_PROGRESS",
        iterations: iteration,
        history: Object.freeze([...history]),
      };
    }

    output = revised;
  }

  return {
    output,
    termination: "EXHAUSTED",
    iterations: maxIterations,
    history: Object.freeze([...history]),
  };
}

export interface FloorClosedLoopReceipt {
  readonly floorId: string;
  readonly loopType: FloorLoopType;
  readonly loopId: string;
  readonly termination: ClosedLoopTermination;
  readonly iterations: number;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly verified: boolean;
  readonly evidenceRefs: readonly string[];
  readonly failureReason?: string;
}
