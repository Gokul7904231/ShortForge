import type {
  ResolutionGateDecision,
  ResolutionProof,
} from "./FloorGovernanceContracts";

export class ResolutionGate {
  evaluate(proof: ResolutionProof): ResolutionGateDecision {
    if (!proof.bdaPass) {
      return { allowed: false, reason: "bda_reinspection_failed" };
    }
    if (!proof.auditorPass) {
      return { allowed: false, reason: "auditor_verification_failed" };
    }
    if (!proof.guardianClosureGrant) {
      return { allowed: false, reason: "guardian_closure_missing" };
    }
    return { allowed: true, reason: "incident_closure_proven" };
  }
}
