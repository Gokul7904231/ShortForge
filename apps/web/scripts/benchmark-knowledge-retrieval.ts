#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import { KnowledgeStore } from "../factoryos/core/intelligence/knowledge/KnowledgeStore";
import { KnowledgeStoreRetrievalProvider } from "../factoryos/core/research/KnowledgeStoreRetrievalProvider";
import { runHybridRetrievalBenchmark } from "../factoryos/core/research/HybridRetrievalBenchmark";

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
  const provider = new KnowledgeStoreRetrievalProvider(store, corpusRevision);
  const report = await runHybridRetrievalBenchmark(provider, parsed.data, {
    topK: 10,
    maxCases: 200,
    queryTimeoutMs: 30_000,
  });

  const quality = store.validateShortForgeKnowledgeQuality();
  const duplicates = store.getDuplicateIdErrors().length;
  process.stdout.write(JSON.stringify({
    schemaVersion: "shortforge-knowledge-retrieval-baseline-run.v1",
    disposition: "BASELINE_ONLY",
    candidateComparison: "NOT_RUN",
    datasetFileName: path.basename(datasetPath),
    datasetSha256: createHash("sha256").update(raw, "utf8").digest("hex"),
    corpusRevision,
    corpusQuality: {
      passing: quality.passing,
      documentCount: quality.totalDocuments,
      secretFindingCount: quality.secretLeakErrors.length,
      duplicateIdGroupCount: duplicates,
    },
    qualification: "This report measures the existing KnowledgeStore retrieval baseline only. It does not prove zvec-grep integration or a hybrid-search improvement.",
    report,
  }, null, 2) + "\n");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unexpected retrieval evaluation error.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
