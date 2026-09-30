# Project Ascalon: Trajectory Format Specification (v1.0.0)

## 1. Overview

The **Ascalon Trajectory Format (v1.0.0)** is the canonical data representation for operational experience within ShortForge / FactoryOS. It captures the complete situational context, reasoning chain, safety authorization, execution invocation, and verified physical evidence for each decision step.

Each trajectory is serialized as an atomic JSON object in JSON Lines (`.jsonl`) files.

---

## 2. Top-Level Schema Structure

```json
{
  "trajectoryId": "traj_ascalon_golden_001",
  "schemaVersion": "1.0.0",
  "hierarchyVersion": "1.0.0",
  "timestamp": 1774320000000,
  "episode": {
    "missionId": "mission_alpha_001",
    "missionFamily": "FAMILY_NARRATIVE_SHORT",
    "stepIndex": 1,
    "totalSteps": 5
  },
  "environment": {
    "environmentType": "PRODUCTION",
    "runtimeHost": "factoryos-node-01",
    "nodeVersion": "v22.0.0"
  },
  "observation": {
    "activeFloor": "floor02_narrative_architecture",
    "agentRole": "NARRATIVE_ARCHITECT",
    "worldStateSnapshotId": "snap_f02_001",
    "inputPayloadHash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "systemConstraints": {
      "maxDurationSec": 60,
      "targetAudience": "TECH_ENTHUSIASTS",
      "format": "VERTICAL_9_16"
    }
  },
  "decision": {
    "decisionType": "CHOICE",
    "question": "Select pacing curve for narrative arc",
    "chosenOption": "HOOK_ACCELERATED",
    "rationale": "High drop-off rate detected in first 3 seconds; hook-accelerated pacing maximizes retention.",
    "confidence": 0.94,
    "uncertainty": {
      "calibrationStatus": "CALIBRATED",
      "entropy": 0.12
    }
  },
  "authorization": {
    "requested": true,
    "authorized": true,
    "guardianDecision": "GRANTED",
    "policyEnforced": "POL_CONTENT_SAFETY_STANDARD_V2",
    "fencingToken": 1042
  },
  "execution": {
    "tool": "cap_script_synthesis",
    "invokedWith": {
      "pacing": "HOOK_ACCELERATED",
      "scriptDraftId": "draft_0918"
    },
    "durationMs": 420,
    "exitCode": 0
  },
  "outcome": {
    "status": "SUCCESS",
    "verified": true,
    "verificationEvidenceId": "ev_script_sha256_verified",
    "metrics": {
      "estimatedRetentionScore": 88.5,
      "wordCount": 142
    }
  },
  "provenance": {
    "labelSource": "VERIFIED_OUTCOME",
    "synthetic": false,
    "simulation": false,
    "replayDeterministic": true,
    "auditDigest": "8f3663c607ee4001aacf0f09987617ff"
  }
}
```

---

## 3. Field Definitions & Integrity Rules

### 3.1 `episode`
- `missionFamily`: Categorical cluster (e.g., `FAMILY_NARRATIVE_SHORT`, `FAMILY_VIRAL_NEWS`, `FAMILY_EDUCATIONAL_EXPLAINER`). Partitioning between train, validation, and test splits is strictly performed at the `missionFamily` boundary to prevent data leakage.
- `stepIndex`: 1-indexed sequential order within the mission.

### 3.2 `observation`
- `activeFloor`: Must match one of the 8 canonical floor identifiers defined in `floors.json` (`floor00_research_ingest` through `floor07_render_packaging`).
- `inputPayloadHash`: SHA-256 hex digest of the raw task inputs.

### 3.3 `authorization`
- `guardianDecision`: Must be `GRANTED`, `DENIED`, or `BYPASS_DISALLOWED`.
- **Integrity Rule**: If `authorized: true` and `guardianDecision: "DENIED"`, the trajectory validator rejects the record (`AUTHORIZATION_CONTRADICTION`).

### 3.4 `outcome`
- **Integrity Rule (Claim <= Evidence)**: If `status: "SUCCESS"`, `verified` must be `true` and `verificationEvidenceId` must reference a valid evidence artifact. Trajectories asserting success without verification are flagged as `UNVERIFIED_SUCCESS_CLAIM`.

### 3.5 `provenance`
- `labelSource`: Specifies generation pedigree (`VERIFIED_OUTCOME`, `HUMAN_EXPERT`, `DETERMINISTIC_TEACHER`).
- **Integrity Rule**: Trajectories with `environmentType: "SIMULATION"` or `synthetic: true` cannot be tagged with `labelSource: "VERIFIED_OUTCOME"` (`SIMULATION_CONTAMINATION`).
