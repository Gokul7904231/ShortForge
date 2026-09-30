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


---

## 6. Blender MCP trajectory extension — v1.1.0

For Blender-backed decisions, the trajectory records semantic intent separately from the runtime MCP implementation.

### Required Blender fields

```json
{
  "decision": {
    "domain": "BLENDER",
    "semanticAction": "CAMERA_CONFIGURE",
    "reasonCode": "VISUAL_COMPOSITION_REQUIRED",
    "preconditions": ["scene_inspected"],
    "provider": null
  },
  "execution": {
    "tool": "blender.mcp",
    "resolvedTool": "execute_blender_code",
    "capabilitySnapshotDigest": "<sha256>",
    "requestDigestSha256": "<sha256>",
    "runtimeProtocolVersion": "2025-11-25",
    "runtimeServerVersion": "2.1.1"
  }
}
```

### Blender integrity rules

- `decision.semanticAction` must be one of the actions in `training/ascalon/ontology/blender-capabilities.json`.
- `execution.resolvedTool` must have been present in the runtime `tools/list` result.
- The learned decision vocabulary must use the semantic action; the resolved tool is implementation metadata.
- `ASSET_SEARCH`, `ASSET_IMPORT`, and `ASSET_GENERATE` require an explicit provider.
- `PYTHON_EXECUTE` requires a documented dangerous-capability authorization and must not be silently substituted for another semantic action.
- Blender mutation success requires an independent post-execution observation.
- Render success requires physical artifact verification; MCP success alone is insufficient.
- Simulation/synthetic Blender curriculum can be used for deterministic teacher training only when labeled `DETERMINISTIC_TEACHER` and isolated from production-ground-truth trajectories.
- Runtime tool availability must never be inferred from historical trajectories alone.

## 7. Training separation

The training pipeline stores three distinct signals:

1. **Decision signal** — semantic intent and preconditions.
2. **Implementation signal** — runtime MCP tool/version/capability snapshot.
3. **Outcome signal** — independently verified scene/artifact state.

This prevents Ascalon from overfitting to today's MCP tool names while still allowing the model to learn implementation selection and failure recovery.
