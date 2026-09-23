# Project Ascalon: Authoritative Data Contracts

## 1. Overview

This document specifies the authoritative TypeScript and JSON Schema interfaces governing operational decision-making, capability execution, and trajectory persistence in ShortForge / FactoryOS.

---

## 2. Decision Contracts (`DecisionContracts.ts`)

### 2.1 Decision Status & Error Taxonomy

```typescript
export type DecisionStatus = "VALID" | "INVALID" | "UNRESOLVED";

export type DecisionValidationErrorCode =
  | "INVALID_JSON"
  | "INVALID_CHOICE"
  | "INVALID_SCORE"
  | "INVALID_CONFIDENCE"
  | "INVALID_DISTRIBUTION"
  | "INVALID_RUBRIC_LEVEL"
  | "UNKNOWN_OPTION"
  | "TIMEOUT"
  | "SCHEMA_MISMATCH";
```

### 2.2 Decision Uncertainty & Calibration

```typescript
export type CalibrationStatus = "CALIBRATED" | "UNCALIBRATED" | "ESTIMATED";

export interface DecisionUncertainty {
  readonly entropy?: number;
  readonly confidenceInterval?: [number, number];
  readonly calibrationStatus: CalibrationStatus;
  readonly epistemicUncertainty?: number;
}
```

### 2.3 Adapter Metadata

```typescript
export interface AdapterMetadata {
  readonly adapterType: "REAL_LLM" | "HEURISTIC_SHADOW" | "DETERMINISTIC_RULES" | "MOCK";
  readonly modelId?: string;
  readonly promptVersion?: string;
  readonly isProductionAuthority: boolean;
  readonly isTrainingEligible: boolean;
}
```

### 2.4 Typed Decision Responses

```typescript
export interface TypedDecisionResult<T = unknown> {
  readonly status: DecisionStatus;
  readonly payload?: T;
  readonly rawOutput: string;
  readonly confidence: number;
  readonly uncertainty: DecisionUncertainty;
  readonly latencyMs: number;
  readonly errors?: Array<{
    readonly code: DecisionValidationErrorCode;
    readonly message: string;
  }>;
  readonly adapterMetadata: AdapterMetadata;
}
```

---

## 3. WorldState Contracts (`WorldStateContracts.ts`)

### 3.1 Measurement Fidelity

```typescript
export type MeasurementFidelity =
  | "REAL_MEASURED"      // Direct sensor or API measurement
  | "ESTIMATED"          // Interpolated or estimated by proxy
  | "BOUNDED_ESTIMATE"   // Conservative upper/lower bound
  | "UNKNOWN";           // Unmeasured placeholder
```

### 3.2 State Provenance & Snapshot Contract

```typescript
export interface WorldStateSnapshotContract {
  readonly snapshotId: string;
  readonly timestamp: number;
  readonly environmentType: "PRODUCTION" | "STAGING" | "SIMULATION";
  readonly floorStates: Record<string, {
    readonly activeWorkerCount: number;
    readonly pendingTaskCount: number;
    readonly errorRate: number;
    readonly fidelity: MeasurementFidelity;
  }>;
  readonly resourceQuotas: {
    readonly gpuUtilizationPercent: number;
    readonly diskRemainingBytes: number;
    readonly apiRateRemaining: Record<string, number>;
    readonly fidelity: MeasurementFidelity;
  };
  readonly activeLeases: Array<{
    readonly workerId: string;
    readonly floorId: string;
    readonly fencingToken: number;
    readonly expiresAt: number;
  }>;
  readonly provenanceDigest: string; // SHA-256 digest of state payload
}
```

---

## 4. Provenance & Labeling Taxonomy (`DecisionLedger.ts`)

Every recorded operational entry must include its authoritative `labelSource`:

| Label Source | Description | Training Eligible |
| :--- | :--- | :---: |
| `VERIFIED_OUTCOME` | Real production execution verified against ground truth evidence. | **YES** |
| `HUMAN_EXPERT` | Real human supervisor correction or gold-standard annotation. | **YES** |
| `DETERMINISTIC_TEACHER`| Synthesized through formal axiomatic rules and invariants. | **YES** |
| `HEURISTIC_FALLBACK` | Rule-based local heuristic fallback during model outage. | **NO** |
| `SIMULATION_PSEUDO` | Unverified sandbox simulation output. | **NO** |
