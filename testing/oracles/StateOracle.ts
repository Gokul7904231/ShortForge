import type { MissionRun } from "../model/MissionRun";
import type { Finding } from "../model/Finding";

export class StateOracle {
  public static evaluate(run: MissionRun): Finding[] {
    const findings: Finding[] = [];

    // 1. Check if mission started
    const startEvt = run.events.find((e) => e.action.type === "mission_started");
    if (!startEvt) {
      findings.push({
        id: "find_missing_mission_started",
        rule: "state/missing-initial-transition",
        severity: "critical",
        subject: run.missionId,
        evidence: ["No mission_started or RUN_STARTED event found in execution trace"],
        expected: "Explicit mission_started event",
        observed: "Mission started event missing",
        rootCause: "Mission runner did not register initial transition",
        confidence: 1.0,
        supportedRepairs: [],
      });
    }

    // 2. Check for premature terminal state
    const completeEvt = run.events.find((e) => e.action.type === "mission_completed");
    if (run.finalVerdict === "PASS" && !completeEvt) {
      findings.push({
        id: "find_premature_terminal_pass",
        rule: "state/inconsistent-completion-status",
        severity: "error",
        subject: run.missionId,
        evidence: [`Final verdict is PASS but mission_completed event was not recorded`],
        expected: "mission_completed event emitted prior to PASS verdict",
        observed: "Completion event absent",
        rootCause: "Runner reached terminal status without recording completion event",
        confidence: 1.0,
        supportedRepairs: [],
      });
    }

    // 3. Check for illegal failure transitions
    const failEvt = run.events.find((e) => e.action.type === "failure");
    if (failEvt && run.finalVerdict === "PASS" && !run.events.some((e) => e.action.type === "recovery")) {
      findings.push({
        id: "find_unrecovered_failure_pass",
        rule: "state/unrecovered-failure-passed",
        severity: "critical",
        subject: run.missionId,
        evidence: [`Failure event detected (${failEvt.action.name}) with PASS verdict but zero recovery events`],
        expected: "Failure must either be recovered or result in non-PASS verdict",
        observed: "Mission marked PASS despite unrecovered failure",
        rootCause: "Optimistic status overwrite without explicit recovery record",
        confidence: 1.0,
        supportedRepairs: [],
      });
    }

    return findings;
  }
}
