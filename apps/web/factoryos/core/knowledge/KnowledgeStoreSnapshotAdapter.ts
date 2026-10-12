import { createHash } from "node:crypto";
import type { KnowledgeDocument, OKFFrontmatter } from "../intelligence/knowledge/OKFContracts";
import type { KnowledgeStore } from "../intelligence/knowledge/KnowledgeStore";
import { calculateKnowledgeOSSnapshotContentDigest } from "./KnowledgeOS";
import type {
  KnowledgeObject,
  KnowledgeOSSnapshot,
  KnowledgeOSSnapshotContent,
  KnowledgeOSSnapshotScope,
  KnowledgeOSSnapshotSource,
  KnowledgeRelationship,
} from "./KnowledgeOSContracts";

interface KnowledgeStoreSnapshotRecord extends KnowledgeObject {
  readonly type: "KNOWLEDGE_DOCUMENT";
  readonly title: string;
  readonly documentType: string;
  readonly filePath: string;
  readonly contentSha256: string;
  readonly contentByteLength: number;
  readonly tags: readonly string[];
  readonly lifecycle?: string;
  readonly epistemicState?: string;
  readonly verificationState?: string;
  readonly qualityState?: string;
  readonly sourceIds: readonly string[];
  readonly evidenceRefs: readonly string[];
  readonly createdAtSemantics: "FRONTMATTER" | "UNKNOWN";
  readonly updatedAtSemantics: "FRONTMATTER" | "UNKNOWN";
  readonly channelId?: string;
}

export interface KnowledgeStoreSnapshotAdapterOptions {
  readonly maxDocuments?: number;
  readonly maxDocumentBytes?: number;
  readonly maxFrontmatterBytes?: number;
}

const UNKNOWN_DATE = "1970-01-01T00:00:00.000Z";
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) {
    return "[" + value.map((item) => canonicalize(item)).join(",") + "]";
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return "{" + Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => JSON.stringify(key) + ":" + canonicalize(record[key]))
      .join(",") + "}";
  }
  return JSON.stringify(value) ?? "null";
}

function safeString(value: unknown, maxLength = 2048): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength || CONTROL_CHARS.test(trimmed)) return undefined;
  return trimmed;
}

function stableTimestamp(...candidates: unknown[]): string | undefined {
  for (const candidate of candidates) {
    const value = safeString(candidate, 64);
    if (value && Number.isFinite(Date.parse(value))) {
      return new Date(Date.parse(value)).toISOString();
    }
  }
  return undefined;
}

function normalizedPath(value: string): string | undefined {
  const normalized = value.replace(/\\/g, "/").trim();
  if (!normalized || normalized.length > 1024 || CONTROL_CHARS.test(normalized)) return undefined;
  if (normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)) return undefined;
  if (normalized.split("/").some((segment) => segment === ".." || segment === ".")) return undefined;
  return normalized;
}

function metadataIds(values: unknown, maxItems = 100): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values
    .slice(0, maxItems)
    .map((value) => safeString(value, 512))
    .filter((value): value is string => Boolean(value)))]
    .sort((a, b) => a.localeCompare(b));
}

function isInScope(frontmatter: OKFFrontmatter, selection: KnowledgeOSSnapshotScope): boolean {
  const raw = frontmatter as unknown as Record<string, unknown>;
  const missionId = safeString(raw.mission_id, 256);
  const channelId = safeString(raw.channel_id, 256);
  const scopeKey = safeString(raw.scope_key, 256)?.toUpperCase();
  const observationScope = safeString(raw.sf_observation_scope, 256)?.toUpperCase();

  if (selection.scope === "MISSION") {
    return missionId === selection.missionId && !channelId;
  }
  if (selection.scope === "CHANNEL") {
    return channelId === selection.channelId && !missionId;
  }

  // Unscoped repository knowledge is global. Explicit non-global scopes are never
  // promoted into the global projection merely because their identifiers are missing.
  if (missionId || channelId) return false;
  if (scopeKey && scopeKey !== "GLOBAL") return false;
  if (observationScope && observationScope !== "GLOBAL") return false;
  return true;
}

function documentId(document: KnowledgeDocument): string | undefined {
  const raw = document.frontmatter.sf_id || document.frontmatter.id;
  const value = safeString(raw, 512);
  return value ? "okfdoc:" + value : undefined;
}

function buildRecord(
  document: KnowledgeDocument,
  maxDocumentBytes: number,
  maxFrontmatterBytes: number,
): KnowledgeStoreSnapshotRecord | null {
  const fm = document.frontmatter;
  const rawFrontmatter = fm as unknown as Record<string, unknown>;
  const id = documentId(document);
  const filePath = normalizedPath(document.filePath);
  if (!id || !filePath) return null;

  const contentByteLength = Buffer.byteLength(document.content, "utf8");
  if (contentByteLength > maxDocumentBytes) {
    throw new Error("KNOWLEDGE_STORE_SNAPSHOT_DOCUMENT_TOO_LARGE:" + filePath);
  }
  const frontmatterJson = canonicalize(rawFrontmatter);
  if (Buffer.byteLength(frontmatterJson, "utf8") > maxFrontmatterBytes) {
    throw new Error("KNOWLEDGE_STORE_SNAPSHOT_FRONTMATTER_TOO_LARGE:" + filePath);
  }

  const createdFromFrontmatter = stableTimestamp(fm.created_at, fm.sf_valid_from);
  const updatedFromFrontmatter = stableTimestamp(fm.updated_at, fm.sf_last_refreshed_at, fm.sf_valid_from);
  const createdAt = createdFromFrontmatter || UNKNOWN_DATE;
  const updatedAt = updatedFromFrontmatter || createdAt;
  const contentSha256 = digest(document.content);
  const provenanceDigest = digest(canonicalize({
    id,
    filePath,
    frontmatter: rawFrontmatter,
    contentSha256,
    contentByteLength,
  }));
  const missionId = safeString(rawFrontmatter.mission_id, 256);
  const channelId = safeString(rawFrontmatter.channel_id, 256);

  return {
    id,
    type: "KNOWLEDGE_DOCUMENT",
    schemaVersion: "1.0.0",
    createdAt,
    updatedAt,
    provenanceDigest,
    scope: missionId ? "MISSION" : channelId ? "CHANNEL" : "GLOBAL",
    ...(missionId ? { missionId } : {}),
    ...(channelId ? { channelId } : {}),
    title: safeString(fm.title, 256) || safeString(fm.id, 512) || filePath,
    documentType: safeString(fm.type, 128) || "unknown",
    filePath,
    contentSha256,
    contentByteLength,
    tags: metadataIds(fm.tags, 50).map((tag) => tag.slice(0, 80)),
    ...(safeString(fm.sf_lifecycle, 64) ? { lifecycle: safeString(fm.sf_lifecycle, 64) } : {}),
    ...(safeString(fm.sf_epistemic_state || fm.epistemic_state, 64)
      ? { epistemicState: safeString(fm.sf_epistemic_state || fm.epistemic_state, 64) }
      : {}),
    ...(safeString(fm.sf_verification_state || fm.verification, 64)
      ? { verificationState: safeString(fm.sf_verification_state || fm.verification, 64) }
      : {}),
    ...(safeString(fm.sf_quality_state, 64) ? { qualityState: safeString(fm.sf_quality_state, 64) } : {}),
    sourceIds: metadataIds((fm.sources || []).map((source) => source.id), 100),
    evidenceRefs: metadataIds([
      ...(fm.evidence_refs || []),
      ...(fm.sf_evidence_reference ? [fm.sf_evidence_reference] : []),
    ], 100),
    createdAtSemantics: createdFromFrontmatter ? "FRONTMATTER" : "UNKNOWN",
    updatedAtSemantics: updatedFromFrontmatter ? "FRONTMATTER" : "UNKNOWN",
  };
}

/**
 * Projects the existing canonical OKF KnowledgeStore into a bounded, read-only
 * snapshot. Full document bodies are never persisted in the snapshot; only their
 * SHA-256 and byte length are retained. Secret-flagged and duplicate-ID documents
 * are excluded. The adapter is not a new knowledge authority or storage engine.
 */
export class KnowledgeStoreSnapshotAdapter implements KnowledgeOSSnapshotSource {
  public readonly sourceKind = "OKF_KNOWLEDGE_STORE" as const;
  private readonly maxDocuments: number;
  private readonly maxDocumentBytes: number;
  private readonly maxFrontmatterBytes: number;

  constructor(
    private readonly store: KnowledgeStore,
    options: KnowledgeStoreSnapshotAdapterOptions = {},
  ) {
    this.maxDocuments = options.maxDocuments ?? 10_000;
    this.maxDocumentBytes = options.maxDocumentBytes ?? 8 * 1024 * 1024;
    this.maxFrontmatterBytes = options.maxFrontmatterBytes ?? 512 * 1024;
    if (!Number.isSafeInteger(this.maxDocuments) || this.maxDocuments < 1 || this.maxDocuments > 50_000) {
      throw new Error("KNOWLEDGE_STORE_SNAPSHOT_INVALID_DOCUMENT_LIMIT");
    }
    if (!Number.isSafeInteger(this.maxDocumentBytes) || this.maxDocumentBytes < 1 || this.maxDocumentBytes > 64 * 1024 * 1024) {
      throw new Error("KNOWLEDGE_STORE_SNAPSHOT_INVALID_CONTENT_LIMIT");
    }
    if (!Number.isSafeInteger(this.maxFrontmatterBytes) || this.maxFrontmatterBytes < 1 || this.maxFrontmatterBytes > 2 * 1024 * 1024) {
      throw new Error("KNOWLEDGE_STORE_SNAPSHOT_INVALID_FRONTMATTER_LIMIT");
    }
  }

  public snapshot(selection: KnowledgeOSSnapshotScope): KnowledgeOSSnapshot {
    if (selection.scope === "MISSION" && !safeString(selection.missionId, 256)) {
      throw new Error("KNOWLEDGEOS_SNAPSHOT_MISSION_ID_REQUIRED");
    }
    if (selection.scope === "CHANNEL" && !safeString(selection.channelId, 256)) {
      throw new Error("KNOWLEDGEOS_SNAPSHOT_CHANNEL_ID_REQUIRED");
    }

    const allDocuments = this.store.list();
    const scopedDocuments = allDocuments.filter((document) =>
      isInScope(document.frontmatter, selection),
    );
    if (scopedDocuments.length > this.maxDocuments) {
      throw new Error("KNOWLEDGE_STORE_SNAPSHOT_DOCUMENT_LIMIT_EXCEEDED");
    }

    const quality = this.store.validateShortForgeKnowledgeQuality();
    const secretPaths = new Set(quality.secretLeakErrors.map((finding) => {
      const match = finding.match(/^Secret pattern detected in (.+): /);
      return match?.[1];
    }).filter((value): value is string => Boolean(value)));
    const duplicateIds = new Set(this.store.getDuplicateIdErrors().map((item) => item.id));

    const records: KnowledgeStoreSnapshotRecord[] = [];
    for (const document of scopedDocuments) {
      const rawId = safeString(document.frontmatter.sf_id || document.frontmatter.id, 512);
      if (!rawId || duplicateIds.has(rawId) || secretPaths.has(document.filePath)) continue;
      const record = buildRecord(document, this.maxDocumentBytes, this.maxFrontmatterBytes);
      if (record) records.push(record);
    }
    records.sort((left, right) => left.id.localeCompare(right.id));
    const recordById = new Map(records.map((record) => [record.id, record] as const));
    const aliasToRecordId = new Map<string, string | null>();
    const registerAlias = (aliasValue: unknown, recordId: string) => {
      const alias = safeString(aliasValue, 1024);
      if (!alias) return;
      if (!aliasToRecordId.has(alias)) aliasToRecordId.set(alias, recordId);
      else if (aliasToRecordId.get(alias) !== recordId) aliasToRecordId.set(alias, null);
    };

    for (const document of scopedDocuments) {
      const recordId = documentId(document);
      if (!recordId || !recordById.has(recordId)) continue;
      registerAlias(document.frontmatter.id, recordId);
      registerAlias(document.frontmatter.sf_id, recordId);
      registerAlias(document.frontmatter.resource, recordId);
      registerAlias(document.filePath, recordId);
      registerAlias(normalizedPath(document.filePath), recordId);
    }

    const relationships: KnowledgeRelationship[] = [];
    for (const document of scopedDocuments) {
      const recordId = documentId(document);
      const record = recordId ? recordById.get(recordId) : undefined;
      if (!record) continue;
      for (const source of (document.frontmatter.sources || [])) {
        const sourceId = safeString(source.id, 512);
        const targetRef = safeString(source.resource, 2048);
        if (!sourceId || !targetRef) continue;
        const mappedTarget = aliasToRecordId.get(sourceId) || aliasToRecordId.get(targetRef);
        const toId = mappedTarget || ("okfsrc:" + sourceId);
        relationships.push({
          relationshipId: "DOCUMENT_CITES_SOURCE:" + record.id + ":" + digest(sourceId + ":" + targetRef).slice(0, 24),
          relationType: "DOCUMENT_CITES_SOURCE",
          fromId: record.id,
          toId,
          targetRef,
          resolved: Boolean(mappedTarget && recordById.has(mappedTarget)),
          provenanceDigest: digest(record.provenanceDigest + ":" + sourceId + ":" + targetRef),
        });
      }
      for (const targetRef of record.evidenceRefs) {
        relationships.push({
          relationshipId: "DOCUMENT_REFERENCES_EVIDENCE:" + record.id + ":" + digest(targetRef).slice(0, 20),
          relationType: "DOCUMENT_REFERENCES_EVIDENCE",
          fromId: record.id,
          targetRef,
          resolved: false,
          provenanceDigest: digest(record.provenanceDigest + ":" + targetRef),
        });
      }
    }

    relationships.sort((left, right) => left.relationshipId.localeCompare(right.relationshipId));
    const canonicalContent: KnowledgeOSSnapshotContent = {
      sourceKind: this.sourceKind,
      selection: JSON.parse(JSON.stringify(selection)) as KnowledgeOSSnapshotScope,
      records,
      relationships,
    };
    return {
      schemaVersion: "knowledgeos.snapshot.v1",
      sourceKind: this.sourceKind,
      selection: canonicalContent.selection,
      capturedAt: new Date().toISOString(),
      records,
      relationships,
      contentDigest: calculateKnowledgeOSSnapshotContentDigest(canonicalContent),
    };
  }
}
