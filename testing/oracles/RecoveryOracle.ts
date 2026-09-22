import type { MissionRun } from "../model/MissionRun";
import type { Finding } from "../model/Finding";

export class RecoveryOracle {
  public static evaluate(run: MissionRun): Finding[] {
    const findings: Finding[] = [];

    // Check voice fallback transparency
    const audioArtifact = run.artifacts.find((a) => a.kind === "WAV_AUDIO");
    if (audioArtifact) {
      const voiceEvt = run.events.find(
        (e) => e.actor.floor === "floor04_media_synthesis" && e.action.type === "floor_complete"
      );
      const isFallback = (voiceEvt?.metadata as any)?.output?.isFallback || (voiceEvt?.metadata as any)?.isFallback;

      if (isFallback && run.executionMode === "REAL") {
        findings.push({
          id: "find_recovery_unreported_fallback_mode",
          rule: "recovery/fallback-mode-unreported",
          severity: "warning",
          subject: "floor04_media_synthesis",
          evidence: ["Voice synthesis utilized fallback generator, but executionMode was reported as 'REAL' rather than 'REAL_WITH_DEGRADED_FALLBACK'"],
          expected: "executionMode must be 'REAL_WITH_DEGRADED_FALLBACK' when fallback engine runs",
          observed: "executionMode reported as 'REAL'",
          confidence: 0.9,
          supportedRepairs: [],
        });
      }
    }

    return findings;
  }
}
