import type { MissionRun } from "../../model/MissionRun";
import type { Finding } from "../../model/Finding";

export class VerificationJudge {
  public static judge(run: MissionRun): { passed: boolean; findings: Finding[] } {
    const findings: Finding[] = [];
    const ver = run.verificationResult;

    if (!ver) {
      findings.push({
        id: "find_ver_no_report",
        rule: "verification/report-missing",
        severity: "critical",
        subject: "floor07_compliance",
        evidence: ["No verification report found in mission run record"],
        expected: "Floor 07 Verification Report with 8 hard gates",
        observed: "Report missing",
        rootCause: "Floor 07 did not execute or report failed to attach",
        confidence: 1.0,
        supportedRepairs: [],
      });
      return { passed: false, findings };
    }

    const hardGates = (ver as any).hardGates || {};
    const requiredGates = [
      "artifactExists",
      "validContainer",
      "exact9x16Geometry",
      "videoStreamPresent",
      "audioStreamPresent",
      "decodeSmokePassed",
    ];

    for (const gate of requiredGates) {
      if (hardGates[gate] !== true) {
        findings.push({
          id: `find_ver_gate_failed_${gate}`,
          rule: `verification/hard-gate-${gate}-failed`,
          severity: "critical",
          subject: gate,
          evidence: [`Hard gate '${gate}' evaluated to false in verification report`],
          expected: `Gate '${gate}' must be true`,
          observed: `Gate '${gate}' is false or missing`,
          confidence: 1.0,
          supportedRepairs: [],
        });
      }
    }

    return {
      passed: findings.length === 0,
      findings,
    };
  }
}
