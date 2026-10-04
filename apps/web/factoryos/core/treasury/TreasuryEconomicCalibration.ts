/**
 * Treasury Economic Calibration
 *
 * Pure read-side calibration over verified Treasury settlement evidence.
 * No TreasuryService handle is accepted; this prevents calibration from
 * acquiring mutation authority accidentally.
 */

import type { TreasuryEconomicReadSource } from "./TreasuryEconomicIntelligence";
import type { TreasuryLedgerEvent } from "./TreasuryContracts";

export interface TreasuryRouteCalibrationObservation {
  readonly providerId: string;
  readonly modelId?: string;
  readonly workloadType: string;
  readonly capability?: string;
  readonly samples: number;
  readonly totalCostUsd: number;
  readonly averageLatencyMs?: number;
  readonly p50LatencyMs?: number;
  readonly p90LatencyMs?: number;
  readonly totalTokens: number;
  readonly costPer1kTokensUsd?: number;
  readonly verificationSuccessRate: number;
  readonly verifiedSamples: number;
  readonly confidence: "LOW" | "MEDIUM" | "HIGH";
}

export interface TreasuryRouteCalibrationSnapshot {
  readonly generatedAt: string;
  readonly windowStart: string;
  readonly windowEnd: string;
  readonly observations: readonly TreasuryRouteCalibrationObservation[];
}

type ObservationAccumulator = {
  providerId: string;
  modelId?: string;
  workloadType: string;
  capability?: string;
  latencies: number[];
  totalCostUsd: number;
  totalTokens: number;
  samples: number;
  verifiedSamples: number;
  verifiedSuccesses: number;
};

function numeric(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function workloadType(event: TreasuryLedgerEvent): string {
  const request = Array.isArray(event.payload.resourceRequest)
    ? (event.payload.resourceRequest[0] as Record<string, unknown> | undefined)
    : undefined;
  if (typeof request?.workloadType === "string") {
    return request.workloadType;
  }
  return event.floorId || "UNKNOWN";
}

function requestIdentity(event: TreasuryLedgerEvent): {
  providerId?: string;
  modelId?: string;
  capability?: string;
} {
  const request = Array.isArray(event.payload.resourceRequest)
    ? (event.payload.resourceRequest[0] as Record<string, unknown> | undefined)
    : undefined;
  const metadata =
    request?.metadata && typeof request.metadata === "object"
      ? (request.metadata as Record<string, unknown>)
      : undefined;

  return {
    providerId:
      typeof request?.providerId === "string"
        ? request.providerId
        : undefined,
    modelId:
      typeof request?.modelId === "string"
        ? request.modelId
        : undefined,
    capability:
      typeof metadata?.capability === "string"
        ? metadata.capability
        : undefined,
  };
}

function percentile(values: number[], q: number): number | undefined {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return (
    sorted[lower] * (upper - position) +
    sorted[upper] * (position - lower)
  );
}

function confidence(samples: number): "LOW" | "MEDIUM" | "HIGH" {
  if (samples >= 30) return "HIGH";
  if (samples >= 10) return "MEDIUM";
  return "LOW";
}

export class TreasuryEconomicCalibration {
  constructor(private readonly source: TreasuryEconomicReadSource) {}

  async calibrate(
    accountId: string,
    options: {
      windowMs?: number;
      eventLimit?: number;
      now?: Date;
      notBefore?: Date;
      notAfter?: Date;
    } = {},
  ): Promise<TreasuryRouteCalibrationSnapshot> {
    const now = options.now ?? new Date();
    const windowMs = Math.max(
      60_000,
      options.windowMs ?? 7 * 24 * 60 * 60 * 1000,
    );
    const events = await this.source.listRecentEvents(
      accountId,
      Math.min(10_000, Math.max(100, options.eventLimit ?? 5_000)),
    );
    const startMs = now.getTime() - windowMs;
    const endMs = Math.min(
      now.getTime(),
      options.notAfter?.getTime() ?? now.getTime(),
    );
    const configuredNotBefore = options.notBefore?.getTime();
    const startMs = Math.max(
      now.getTime() - windowMs,
      Number.isFinite(configuredNotBefore)
        ? Number(configuredNotBefore)
        : Number.NEGATIVE_INFINITY,
    );
    const buckets = new Map<string, ObservationAccumulator>();

    for (const event of events) {
      if (event.eventType !== "RESOURCE_CONSUMED") continue;
      const occurred = new Date(event.occurredAt).getTime();
      if (!Number.isFinite(occurred) || occurred < startMs || occurred > endMs) {
        continue;
      }

      // Calibration only trusts settlement events that carry verification
      // evidence. Unverified model economics are useful telemetry, but not
      // safe enough to promote into shadow route advice.
      const verificationReceiptId =
        typeof event.payload.verificationReceiptId === "string"
          ? String(event.payload.verificationReceiptId)
          : undefined;
      if (!verificationReceiptId) continue;

      const identity = requestIdentity(event);
      if (!identity.providerId) continue;

      const workload = workloadType(event);
      const key = [
        identity.providerId,
        identity.modelId ?? "",
        workload,
        identity.capability ?? "",
      ].join("::");

      const bucket =
        buckets.get(key) ??
        {
          providerId: identity.providerId,
          modelId: identity.modelId,
          workloadType: workload,
          capability: identity.capability,
          latencies: [],
          totalCostUsd: 0,
          totalTokens: 0,
          samples: 0,
          verifiedSamples: 0,
          verifiedSuccesses: 0,
        };

      bucket.samples += 1;
      bucket.totalCostUsd += Math.max(0, numeric(event.amountUsd));
      bucket.totalTokens += Math.max(
        0,
        numeric(event.payload.actualTokens),
      );
      const latency = numeric(event.payload.actualDurationMs);
      if (latency > 0) bucket.latencies.push(latency);

      bucket.verifiedSamples += 1;
      if (event.payload.verified === true) {
        bucket.verifiedSuccesses += 1;
      }

      buckets.set(key, bucket);
    }

    const observations = [...buckets.values()].map((bucket) => {
      const avgLatency =
        bucket.latencies.length > 0
          ? bucket.latencies.reduce((sum, value) => sum + value, 0) /
            bucket.latencies.length
          : undefined;

      return {
        providerId: bucket.providerId,
        modelId: bucket.modelId,
        workloadType: bucket.workloadType,
        capability: bucket.capability,
        samples: bucket.samples,
        totalCostUsd: bucket.totalCostUsd,
        averageLatencyMs: avgLatency,
        p50LatencyMs: percentile(bucket.latencies, 0.5),
        p90LatencyMs: percentile(bucket.latencies, 0.9),
        totalTokens: bucket.totalTokens,
        costPer1kTokensUsd:
          bucket.totalTokens > 0
            ? (bucket.totalCostUsd / bucket.totalTokens) * 1000
            : undefined,
        verificationSuccessRate:
          bucket.verifiedSamples > 0
            ? bucket.verifiedSuccesses / bucket.verifiedSamples
            : 0,
        verifiedSamples: bucket.verifiedSamples,
        confidence: confidence(bucket.samples),
      };
    });

    return {
      generatedAt: now.toISOString(),
      windowStart: new Date(startMs).toISOString(),
      windowEnd: new Date(endMs).toISOString(),
      observations,
    };
  }
}
