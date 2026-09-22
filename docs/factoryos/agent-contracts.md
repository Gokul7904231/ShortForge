# FACTORYOS AGENT & CAPABILITY CONTRACTS

## 1. Capability Metadata Schema

```typescript
export type CapabilityType = "SLAYER" | "HEALER" | "INSTRUCTOR" | "VALIDATOR";
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface CapabilityMetadata {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly type: CapabilityType;
  readonly targetAnomalies: string[];
  readonly riskLevel: RiskLevel;
  readonly maxRetries: number;
  readonly timeoutMs: number;
  readonly requiresGuardianGate: boolean;
}

export interface CapabilityExecutionRequest<T = Record<string, unknown>> {
  readonly requestExecutionId: string;
  readonly capabilityId: string;
  readonly missionId: string;
  readonly jobId: string;
  readonly floorId?: string;
  readonly anomalyType: string;
  readonly symptoms: string[];
  readonly inputData: T;
  readonly initiatedBy: "user" | "overseer" | "retry" | "healer" | "manual-admin" | "system-recovery";
  readonly timestamp: string;
}

export interface CapabilityExecutionResult<T = Record<string, unknown>> {
  readonly requestExecutionId: string;
  readonly capabilityId: string;
  readonly status: "SUCCESS" | "FAILED" | "RETRYABLE_ERROR" | "REJECTED";
  readonly findings?: string[];
  readonly repairAction?: string;
  readonly outputData?: T;
  readonly guardianCertificateId?: string;
  readonly durationMs: number;
}
```
