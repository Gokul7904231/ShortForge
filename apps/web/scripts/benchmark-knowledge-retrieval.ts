#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import { KnowledgeStore } from "../factoryos/core/intelligence/knowledge/KnowledgeStore";
import { KnowledgeStoreRetrievalProvider } from "../factoryos/core/research/KnowledgeStoreRetrievalProvider";
import { compareRetrievalBenchmarks, runHybridRetrievalBenchmark } from "../factoryos/core/research/HybridRetrievalBenchmark";
import { HybridKnowledgeRetrievalProvider } from "../factoryos/core/research/HybridKnowledgeRetrievalProvider";

const caseSchema = z.object({
  caseId: z.string().trim().min(1).max(128),
  query: z.string().trim().min(1).max(2000),
  relevantDocumentIds: z.array(z.string().trim().min(1).max(512)).min(1).max(100),
  category: z.enum(["EXACT_IDENTIFIER", "LEXICAL", "SEMANTIC"]),
}).strict();

const datasetSchema = z.array(caseSchema).min(1).max(200);

async function main(): Promise<void> {
  const datasetArg = process.argv[2];
  if (!datasetArg) {
    throw new Error(
      "USAGE: npm run factoryos:eval:knowledge-retrieval -- <judged-cases.json> [corpus-revision]\n" +
      "The dataset must contain human-judged relevant document IDs; no synthetic relevance labels are generated.",
    );
  }

  const datasetPath = path.resolve(process.cwd(), datasetArg);
  const raw = await readFile(datasetPath, "utf8");
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    throw new Error("RETRIEVAL_BENCHMARK_DATASET_INVALID_JSON");
  }
  const parsed = datasetSchema.safeParse(parsedJson);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) =>
      `${issue.path.join(".") || "$"}: ${issue.message}`,
    );
    throw new Error(`RETRIEVAL_BENCHMARK_DATASET_SCHEMA_INVALID\n${issues.join("\n")}`);
  }

  const duplicateCaseIds = parsed.data
    .map((item) => item.caseId)
    .filter((id, index, all) => all.indexOf(id) !== index);
  if (duplicateCaseIds.length) {
    throw new Error(`RETRIEVAL_BENCHMARK_DUPLICATE_CASE_IDS: ${[...new Set(duplicateCaseIds)].join(", ")}`);
  }

  const corpusRevision = process.argv[3] || process.env.SHORTFORGE_BENCHMARK_REVISION || "local-unpinned";
  const store = new KnowledgeStore();
  const baselineProvider = new KnowledgeStoreRetrievalProvider(store, corpusRevision);
  const candidateProvider = new HybridKnowledgeRetrievalProvider(store, corpusRevision);

  // Both providers receive the identical human-judged cases and top-K cut-off.
  const baseline = await runHybridRetrievalBenchmark(baselineProvider, parsed.data, {
    topK: 10,
    maxCases: 200,
    queryTimeoutMs: 30_000,
  });
  const candidate = await runHybridRetrievalBenchmark(candidateProvider, parsed.data, {
    topK: 10,
    maxCases: 200,
    queryTimeoutMs: 30_000,
  });
  const comparison = compareRetrievalBenchmarks(baseline, candidate, {
    minimumRecallDelta: 0,
    minimumMrrDelta: 0,
    minimumExactIdentifierDelta: 0,
    maximumP95LatencyRegressionRatio: 1.5,
    minimumProvenanceCoverage: 1,
    maximumProviderErrorRate: 0,
  });

  const quality = store.validateShortForgeKnowledgeQuality();
  const duplicates = store.getDuplicateIdErrors().length;
  process.stdout.write(JSON.stringify({
    schemaVersion: "shortforge-knowledge-retrieval-evaluation.v1",
    disposition: comparison.eligible ? "ELIGIBLE_FOR_HUMAN_REVIEW" : "NOT_QUALIFIED",
    promotionAuthority: "NONE",
    candidateComparison: "EXISTING_KNOWLEDGE_STORE_VS_CLEAN_ROOM_EXACT_BM25",
    semanticScorerConfigured: false,
    datasetFileName: path.basename(datasetPath),
    datasetSha256: createHash("sha256").update(raw, "utf8").digest("hex"),
    corpusRevision,
    corpusQuality: {
      passing: quality.passing,
      documentCount: quality.totalDocuments,
      secretFindingCount: quality.secretLeakErrors.length,
      duplicateIdGroupCount: duplicates,
    },
    comparison,
    baseline,
    candidate,
    qualification: "This compares current KnowledgeStore ranking to the clean-room exact/BM25 candidate using the same judged cases. No vector scorer or zvec-grep integration is configured. Eligibility is only a numeric gate, not proof of factual correctness or authority to promote.",
  }, null, 2) + "\n");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unexpected retrieval evaluation error.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
