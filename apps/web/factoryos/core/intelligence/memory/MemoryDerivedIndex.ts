import { createHash } from "node:crypto";
import type { KnowledgeDocument } from "../knowledge/OKFContracts";

export interface MemoryDerivedIndexEdge {
  readonly id: string;
  readonly weight: number;
}

export interface MemoryDerivedIndex {
  readonly versionKey: string;
  readonly docCount: number;
  readonly avgLength: number;
  readonly documentTokens: ReadonlyMap<string, readonly string[]>;
  readonly documentFrequency: ReadonlyMap<string, number>;
  readonly tokenPostings: ReadonlyMap<string, ReadonlySet<string>>;
  readonly entityPostings: ReadonlyMap<string, ReadonlySet<string>>;
  readonly adjacency: ReadonlyMap<string, readonly MemoryDerivedIndexEdge[]>;
}

interface RelationLike {
  readonly fromMemoryId: string;
  readonly toMemoryId: string;
  readonly type: string;
  readonly scopeKey: string;
  readonly weight?: number;
}

function tokens(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9_:-]+/).map((token) => token.trim()).filter((token) => token.length >= 2);
}

function relationWeight(type: string): number {
  switch (String(type).toUpperCase()) {
    case "CONTRADICTS": return 1;
    case "SUPERSEDES":
    case "CAUSED_BY":
    case "PRECEDES": return 0.9;
    case "SUPPORTS":
    case "EXTENDS": return 0.8;
    case "ABOUT_ENTITY": return 0.7;
    default: return 0.6;
  }
}

export function buildMemoryDerivedIndex(
  documents: readonly KnowledgeDocument[],
  relations: readonly RelationLike[],
): MemoryDerivedIndex {
  const versionKey = createHash("sha256")
    .update(
      documents.map((document) => [
        document.frontmatter.id,
        document.frontmatter.updated_at ?? "",
        document.frontmatter.sf_source_hash ?? "",
        createHash("sha256").update(document.content, "utf8").digest("hex"),
        document.frontmatter.scope_key ?? document.frontmatter.sf_observation_scope ?? "",
      ].join("|")).sort().join("\n") +
      "\nRELATIONS\n" +
      relations.map((relation) => [
        relation.fromMemoryId,
        relation.toMemoryId,
        relation.type,
        relation.scopeKey,
        relation.weight ?? "",
      ].join("|")).sort().join("\n"),
      "utf8",
    )
    .digest("hex");

  const documentTokens = new Map<string, readonly string[]>();
  const documentFrequency = new Map<string, number>();
  const tokenPostings = new Map<string, Set<string>>();
  const entityPostings = new Map<string, Set<string>>();
  let tokenLengthTotal = 0;

  for (const document of documents) {
    const id = document.frontmatter.id;
    const currentTokens = tokens([
      id,
      document.frontmatter.title || "",
      JSON.stringify(document.frontmatter.tags || []),
      document.content,
    ].join(" "));
    documentTokens.set(id, currentTokens);
    tokenLengthTotal += Math.max(1, currentTokens.length);

    for (const token of new Set(currentTokens)) {
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
      const posting = tokenPostings.get(token) ?? new Set<string>();
      posting.add(id);
      tokenPostings.set(token, posting);
    }

    const entities = Array.isArray(document.frontmatter.entity_refs)
      ? document.frontmatter.entity_refs.filter((value): value is string => typeof value === "string")
      : [];
    for (const entity of entities) {
      const posting = entityPostings.get(entity) ?? new Set<string>();
      posting.add(id);
      entityPostings.set(entity, posting);
    }
  }

  const authorizedScopeKeys = new Set(
    documents.map((document) => String(
      document.frontmatter.sf_observation_scope ||
      document.frontmatter.scope_key ||
      document.frontmatter.mission_id ||
      "GLOBAL",
    )),
  );
  const adjacency = new Map<string, MemoryDerivedIndexEdge[]>();
  for (const relation of relations) {
    if (!authorizedScopeKeys.has(relation.scopeKey)) continue;
    const weight = relation.weight ?? relationWeight(relation.type);
    const forward = adjacency.get(relation.fromMemoryId) ?? [];
    forward.push({ id: relation.toMemoryId, weight });
    adjacency.set(relation.fromMemoryId, forward);
    const reverse = adjacency.get(relation.toMemoryId) ?? [];
    reverse.push({ id: relation.fromMemoryId, weight });
    adjacency.set(relation.toMemoryId, reverse);
  }

  return {
    versionKey,
    docCount: documents.length,
    avgLength: tokenLengthTotal / Math.max(1, documents.length),
    documentTokens,
    documentFrequency,
    tokenPostings,
    entityPostings,
    adjacency,
  };
}
