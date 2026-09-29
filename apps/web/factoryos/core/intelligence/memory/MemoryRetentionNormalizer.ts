import { createHash } from "node:crypto";
import type {
  MemoryConsolidationInput,
  MemoryEvidenceRef,
  MemorySemanticType,
  MemoryScope,
  MemoryRetentionClass,
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

export interface MemoryRetentionDecision {
  readonly retentionClass: MemoryRetentionClass;
  readonly reason: string;
}

export class MemoryRetentionNormalizer {
  constructor(
    private readonly extractor: MemoryFactExtractor = new DeterministicMemoryFactExtractor(),
  ) {}

  public classify(envelope: RetentionEnvelope): MemoryRetentionDecision {
    const serialized = JSON.stringify({
      summary: envelope.summary,
      payload: envelope.payload,
      tags: envelope.tags ?? [],
    });
    if (MemoryRetentionNormalizer.SECRET_PATTERNS.some((pattern) => pattern.test(serialized))) {
      return {
        retentionClass: "DO_NOT_LEARN",
        reason: "credential/secret pattern detected in retention material",
      };
    }
    if (MemoryRetentionNormalizer.HIGH_RISK_PII_PATTERNS.some((pattern) => pattern.test(serialized))) {
      return {
        retentionClass: "TEMPORARY",
        reason: "high-risk PII pattern detected; long-lived learning is blocked",
      };
    }
    return {
      retentionClass: "DURABLE",
      reason: "no blocked sensitive-data pattern detected",
    };
  }

  public async retain(envelope: RetentionEnvelope): Promise<readonly MemoryConsolidationInput[]> {
    const decision = this.classify(envelope);
    if (decision.retentionClass === "DO_NOT_LEARN") return [];
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
          retentionClass: decision.retentionClass,
          evidenceRefs: [evidence],
          entityRefs: [...new Set([...(fact.entityRefs ?? []), ...(envelope.tags ?? [])])],
          sourceHash: envelope.sourceHash,
          relationToExisting: fact.relationToExisting,
        };
      });
  }

  private static SECRET_PATTERNS = [
    /bearer\s+[a-z0-9_.-]{20,}/i,
    /(?:ghp|github_pat|gsk_|AIzaSy)[a-z0-9_\-]{16,}/i,
    /eyJ[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+/i,
    /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/i,
    /(?:password|passwd|api[_-]?key|secret|token)\s*[:=]\s*["'][^"']{4,}["']/i,
    /(?:postgres|postgresql|mongodb|mysql):\/\/[^\s:]+:[^@\s]+@/i,
  ];
  private static HIGH_RISK_PII_PATTERNS = [
    /\b\d{3}-\d{2}-\d{4}\b/, // SSN-like
    /\b\d{16}\b/, // card-like digit sequence
    /\b(?:\+?91[-\s]?)?[6-9]\d{9}\b/, // Indian mobile-like
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  ];

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
