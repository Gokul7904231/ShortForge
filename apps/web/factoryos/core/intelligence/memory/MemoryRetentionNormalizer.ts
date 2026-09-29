import { createHash } from "node:crypto";
import type {
  MemoryConsolidationInput,
  MemoryEvidenceRef,
  MemorySemanticType,
  MemoryScope,
} from "./MemorySemanticsContracts";

export interface RetentionEnvelope {
  readonly memoryId: string;
  readonly scope: MemoryScope;
  readonly summary: string;
  readonly payload: Record<string, unknown>;
  readonly occurredAt: string;
  readonly capturedAt: string;
  readonly sourceType: string;
  readonly sourceId: string;
  readonly sourceHash?: string;
  readonly tags?: readonly string[];
}

export interface ExtractedMemoryFact {
  readonly memoryId?: string;
  readonly statement: string;
  readonly semanticType?: MemorySemanticType;
  readonly entityRefs?: readonly string[];
  readonly relationToExisting?: MemoryConsolidationInput["relationToExisting"];
}

export interface MemoryFactExtractor {
  extract(
    envelope: RetentionEnvelope,
  ): readonly ExtractedMemoryFact[] | Promise<readonly ExtractedMemoryFact[]>;
}

export class DeterministicMemoryFactExtractor implements MemoryFactExtractor {
  public extract(envelope: RetentionEnvelope): readonly ExtractedMemoryFact[] {
    const payloadEntities = [
      "missionId",
      "runId",
      "workerId",
      "floorId",
      "provider",
      "projectId",
      "channelId",
      "entityId",
      "caseId",
    ].flatMap((key) => {
      const value = envelope.payload[key];
      return typeof value === "string" && value.trim() ? [key + ":" + value] : [];
    });

    return [{
      memoryId: envelope.memoryId,
      statement: envelope.summary,
      semanticType: this.typeFor(envelope.sourceType),
      entityRefs: [...new Set(payloadEntities)],
    }];
  }

  private typeFor(sourceType: string): MemorySemanticType {
    const normalized = sourceType.toLowerCase();
    if (normalized.includes("fact") || normalized.includes("verification")) return "WORLD_FACT";
    if (normalized.includes("evidence") || normalized.includes("receipt")) return "EVIDENCE";
    return "EXPERIENCE";
  }
}

export class MemoryRetentionNormalizer {
  constructor(
    private readonly extractor: MemoryFactExtractor = new DeterministicMemoryFactExtractor(),
  ) {}

  public async retain(envelope: RetentionEnvelope): Promise<readonly MemoryConsolidationInput[]> {
    const facts = await this.extractor.extract(envelope);
    return facts
      .filter((fact) => fact.statement.trim())
      .map((fact, index) => {
        const memoryId = fact.memoryId || envelope.memoryId + ":" + index;
        const evidenceId = "retained:" + createHash("sha256")
          .update(envelope.sourceId + ":" + memoryId + ":" + envelope.capturedAt)
          .digest("hex")
          .slice(0, 24);
        const evidence: MemoryEvidenceRef = {
          id: evidenceId,
          sourceId: envelope.sourceId,
          sourceType: envelope.sourceType,
          capturedAt: envelope.capturedAt,
          sourceHash: envelope.sourceHash,
          verificationState: "UNVERIFIED",
          authority: "UNKNOWN",
        };

        return {
          memoryId,
          scope: envelope.scope,
          facetKey: this.facetFor(fact),
          statement: fact.statement,
          semanticType:
            fact.semanticType === "WORLD_FACT" ||
            fact.semanticType === "EVIDENCE" ||
            fact.semanticType === "EXPERIENCE"
              ? fact.semanticType
              : "EXPERIENCE",
          verificationState: "UNVERIFIED" as const,
          authority: "UNKNOWN" as const,
          occurredAt: envelope.occurredAt,
          evidenceRefs: [evidence],
          entityRefs: [...new Set([...(fact.entityRefs ?? []), ...(envelope.tags ?? [])])],
          sourceHash: envelope.sourceHash,
          relationToExisting: fact.relationToExisting,
        };
      });
  }

  private facetFor(fact: ExtractedMemoryFact): string {
    if (fact.relationToExisting?.observationId) {
      return "linked:" + fact.relationToExisting.observationId;
    }
    return fact.statement
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120) || "general";
  }
}
