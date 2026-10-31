import { AEREngine } from "./AEREngine";
import { AERMetricsRecorder } from "./AERMetrics";
import { JsonlAEREpisodeTelemetrySink } from "./AEREpisodeTelemetry";
import type { AEROutcomeEvidenceVerifier } from "./AEROutcomeEvidence";

/**
 * Explicit Node-side composition for an AER shadow runtime.
 *
 * Callers must supply the trusted outcome verifier. This factory is not wired
 * into production routing and never enables canary/promotion by itself.
 */
export function createAERShadowRuntime(input: {
  readonly outcomeEvidenceVerifier: AEROutcomeEvidenceVerifier;
  readonly telemetryPath?: string;
}) {
  const telemetrySink = new JsonlAEREpisodeTelemetrySink(input.telemetryPath);
  const metrics = new AERMetricsRecorder(
    telemetrySink,
    input.outcomeEvidenceVerifier,
  );
  const engine = new AEREngine(metrics);

  return { engine, metrics, telemetrySink };
}
