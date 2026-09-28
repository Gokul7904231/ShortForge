import { createHash, randomUUID } from "node:crypto";
import type {
  BorderDossier,
  BorderEvent,
} from "./FloorGovernanceContracts";

export interface BorderAdmissionRequest {
  readonly sourceFloor: string;
  readonly destinationFloor: string;
  readonly actor: string;
  readonly contractVersion: string;
  readonly capability?: string;
  readonly authorizationRef?: string;
  readonly payload: unknown;
  readonly artifactIds?: readonly string[];
  readonly lineageRefs?: readonly string[];
}

export interface BorderInspectionRequest {
  readonly expectedKeys?: readonly string[];
  readonly payload: unknown;
  readonly evidenceRefs?: readonly string[];
  readonly policyAllowed: boolean;
}

export class BorderDefenseAgent {
  private readonly quarantined = new Map<string, BorderDossier>();

  private digest(payload: unknown): string {
    return createHash("sha256")
      .update(JSON.stringify(payload, (_key, value) =>
        typeof value === "bigint" ? value.toString() : value
      ))
      .digest("hex");
  }

  admit(request: BorderAdmissionRequest): BorderEvent | { denied: true; reason: string } {
    if (!request.sourceFloor || !request.destinationFloor) {
      return { denied: true, reason: "source and destination floors are required" };
    }
    if (!request.contractVersion) {
      return { denied: true, reason: "contractVersion is required" };
    }

    const inputHash = this.digest(request.payload);
    return {
      borderEventId: `border_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
      sourceFloor: request.sourceFloor,
      destinationFloor: request.destinationFloor,
      direction: request.destinationFloor ? "INGRESS" : "EGRESS",
      actor: request.actor,
      authorizationRef: request.authorizationRef,
      contractVersion: request.contractVersion,
      inputHash,
      artifactIds: [...(request.artifactIds || [])],
      lineageRefs: [...(request.lineageRefs || [])],
      capabilityUsed: request.capability,
      anomalies: [],
      evidenceRefs: [],
      createdAt: new Date().toISOString(),
    };
  }

  inspect(
    event: BorderEvent,
    request: BorderInspectionRequest
  ): BorderDossier {
    const anomalies: string[] = [];

    if (!request.policyAllowed) {
      anomalies.push("POLICY_DENIED");
    }

    if (
      request.expectedKeys &&
      request.payload &&
      typeof request.payload === "object" &&
      !Array.isArray(request.payload)
    ) {
      const record = request.payload as Record<string, unknown>;
      for (const key of request.expectedKeys) {
        if (!(key in record)) anomalies.push(`MISSING_FIELD:${key}`);
      }
    }

    const passed = anomalies.length === 0;
    const policyDecision: BorderDossier["policyDecision"] =
      passed ? "ALLOW" : request.policyAllowed ? "QUARANTINE" : "DENY";

    const dossier: BorderDossier = {
      borderEventId: event.borderEventId,
      sourceFloor: event.sourceFloor,
      destinationFloor: event.destinationFloor,
      direction: event.direction,
      actor: event.actor,
      contractVersion: event.contractVersion,
      inputHash: event.inputHash,
      artifactIds: event.artifactIds,
      lineageEdges: event.lineageRefs,
      capabilityUsed: event.capabilityUsed,
      policyDecision,
      inspectionResults: passed ? ["SCHEMA_PASS", "POLICY_PASS"] : anomalies,
      anomalies,
      evidenceRefs: [...(request.evidenceRefs || [])],
      contained: !passed,
      createdAt: new Date().toISOString(),
    };

    if (dossier.contained) this.quarantined.set(dossier.borderEventId, dossier);
    return dossier;
  }

  egress(
    event: BorderEvent,
    output: unknown,
    request: Omit<BorderInspectionRequest, "payload"> = {}
  ): BorderDossier {
    const updatedEvent: BorderEvent = {
      ...event,
      direction: "EGRESS",
      outputHash: this.digest(output),
    };
    return this.inspect(updatedEvent, {
      ...request,
      payload: output,
      policyAllowed: request.policyAllowed ?? true,
    });
  }

  isQuarantined(borderEventId: string): boolean {
    return this.quarantined.has(borderEventId);
  }

  getQuarantine(borderEventId: string): BorderDossier | undefined {
    const dossier = this.quarantined.get(borderEventId);
    return dossier ? structuredClone(dossier) : undefined;
  }

  listQuarantine(): BorderDossier[] {
    return Array.from(this.quarantined.values()).map((d) => structuredClone(d));
  }
}
