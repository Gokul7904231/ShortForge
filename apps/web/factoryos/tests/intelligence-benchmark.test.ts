/**
 * ShortForge / FactoryOS — Real Information Retrieval Benchmark Suite
 * Evaluates 50 High-Quality Ground-Truth Queries across 10 Distinct Categories:
 * 1. STRUCTURAL (AST nodes, file dependencies, callers)
 * 2. DECISION (ADRs, architectural rationale, rejected alternatives)
 * 3. TEMPORAL (Git changes, historical revisions)
 * 4. RUNTIME (Live kernel state, active missions, queue depth)
 * 5. SYNTHESIS (Multi-source cross-floor reasoning)
 * 6. CONFLICT (Runtime state contradicts historical crash / knowledge)
 * 7. STALE (Superseded decisions and obsolete specs)
 * 8. AMBIGUOUS (Vague search terms requiring disambiguation)
 * 9. NO_EVIDENCE (Unimplemented features or non-existent capabilities)
 * 10. SECURITY (Adversarial secret probes and private key leakage vectors)
 *
 * Deterministically computes:
 * - Precision@k
 * - Recall@k
 * - Mean Reciprocal Rank (MRR)
 * - Normalized Discounted Cumulative Gain (nDCG@k)
 * - Evidence Coverage
 * - Unsupported Claim Rate
 * - Secret Leakage Rate (Strict 0.0% tolerated)
 * - Latency (p50 / p95)
 */

import { describe, it, expect, beforeAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { IntelligenceGateway } from "../core/intelligence/IntelligenceGateway";
import { EvidenceSourceType } from "../core/intelligence/retrieval/RetrievalContracts";

export interface BenchmarkGoldQuery {
  readonly id: string;
  readonly category:
    | "STRUCTURAL"
    | "DECISION"
    | "TEMPORAL"
    | "RUNTIME"
    | "SYNTHESIS"
    | "CONFLICT"
    | "STALE"
    | "AMBIGUOUS"
    | "NO_EVIDENCE"
    | "SECURITY";
  readonly query: string;
  readonly expectedIntent: string;
  readonly requiredSourceTypes: EvidenceSourceType[];
  readonly goldEvidenceIds: string[];
  readonly requiredClaims: string[];
  readonly forbiddenEvidence?: string[];
  readonly expectInsufficientEvidence?: boolean;
}

interface QueryMetricResult {
  readonly id: string;
  readonly precisionAtK: number;
  readonly recallAtK: number;
  readonly reciprocalRank: number;
  readonly ndcgAtK: number;
  readonly evidenceCoverage: number;
  readonly secretLeakage: number;
  readonly unsupportedClaims: number;
  readonly latencyMs: number;
  readonly estimatedTokens: number;
}

describe("FactoryOS — 50-Query Information Retrieval Benchmark Suite", () => {
  let gateway: IntelligenceGateway;

  const goldCorpus: BenchmarkGoldQuery[] = [
    // === 1. STRUCTURAL AST (5) ===
    {
      id: "Q-STR-01",
      category: "STRUCTURAL",
      query: "Where is the basic render worker implemented?",
      expectedIntent: "CODE_LOCATION",
      requiredSourceTypes: ["STRUCTURAL"],
      goldEvidenceIds: ["basic_render_worker"],
      requiredClaims: ["basic_render_worker", "worker"],
    },
    {
      id: "Q-STR-02",
      query: "Where is create_short defined in the source code?",
      category: "STRUCTURAL",
      expectedIntent: "CODE_LOCATION",
      requiredSourceTypes: ["STRUCTURAL"],
      goldEvidenceIds: ["create_short"],
      requiredClaims: ["create_short"],
    },
    {
      id: "Q-STR-03",
      query: "Where is basic_render_api implemented?",
      category: "STRUCTURAL",
      expectedIntent: "CODE_LOCATION",
      requiredSourceTypes: ["STRUCTURAL"],
      goldEvidenceIds: ["basic_render_api"],
      requiredClaims: ["basic_render_api"],
    },
    {
      id: "Q-STR-04",
      query: "Which file defines TemplateRegistry?",
      category: "STRUCTURAL",
      expectedIntent: "CODE_LOCATION",
      requiredSourceTypes: ["STRUCTURAL"],
      goldEvidenceIds: ["TemplateRegistry"],
      requiredClaims: ["TemplateRegistry"],
    },
    {
      id: "Q-STR-05",
      query: "Which file implements RenderFabric?",
      category: "STRUCTURAL",
      expectedIntent: "CODE_LOCATION",
      requiredSourceTypes: ["STRUCTURAL"],
      goldEvidenceIds: ["RenderFabric"],
      requiredClaims: ["RenderFabric"],
    },

    // === 2. DECISION / ADR (5) ===
    {
      id: "Q-DEC-01",
      category: "DECISION",
      query: "Why did we reject Kafka in ShortForge?",
      expectedIntent: "DECISION_RATIONALE",
      requiredSourceTypes: ["KNOWLEDGE"],
      goldEvidenceIds: ["adr-002-async-render-queue"],
      requiredClaims: ["Kafka", "SQLite", "overhead"],
    },
    {
      id: "Q-DEC-02",
      category: "DECISION",
      query: "Why did we choose Content Addressed Storage CAS for artifacts?",
      expectedIntent: "DECISION_RATIONALE",
      requiredSourceTypes: ["KNOWLEDGE"],
      goldEvidenceIds: ["adr-003-cas-artifact-storage"],
      requiredClaims: ["SHA-256", "CAS", "tamper"],
    },
    {
      id: "Q-DEC-03",
      category: "DECISION",
      query: "Why did we choose Hexagonal Architecture for FactoryOS?",
      expectedIntent: "DECISION_RATIONALE",
      requiredSourceTypes: ["KNOWLEDGE"],
      goldEvidenceIds: ["adr-001-hexagonal-factoryos"],
      requiredClaims: ["Hexagonal", "ports", "adapters"],
    },
    {
      id: "Q-DEC-04",
      category: "DECISION",
      query: "What was the architectural trade-off of using Open Knowledge Format OKF?",
      expectedIntent: "DECISION_RATIONALE",
      requiredSourceTypes: ["KNOWLEDGE"],
      goldEvidenceIds: ["guide-okf-knowledge-management"],
      requiredClaims: ["OKF", "YAML", "frontmatter"],
    },
    {
      id: "Q-DEC-05",
      category: "DECISION",
      query: "What decision was made regarding Kaggle ephemeral GPU workers?",
      expectedIntent: "DECISION_RATIONALE",
      requiredSourceTypes: ["KNOWLEDGE"],
      goldEvidenceIds: ["guide-kaggle-gpu-worker-setup"],
      requiredClaims: ["ephemeral", "Kaggle", "GPU"],
    },

    // === 3. TEMPORAL / GIT HISTORY (5) ===
    {
      id: "Q-TMP-01",
      category: "TEMPORAL",
      query: "What changed in recent git commits for rendering?",
      expectedIntent: "TEMPORAL_CHANGE",
      requiredSourceTypes: ["HISTORY"],
      goldEvidenceIds: ["commit"],
      requiredClaims: ["render"],
    },
    {
      id: "Q-TMP-02",
      category: "TEMPORAL",
      query: "Recent change history of Overseer control plane",
      expectedIntent: "TEMPORAL_CHANGE",
      requiredSourceTypes: ["HISTORY"],
      goldEvidenceIds: ["commit"],
      requiredClaims: ["Overseer"],
    },
    {
      id: "Q-TMP-03",
      category: "TEMPORAL",
      query: "What revisions were made to compute fabric recently?",
      expectedIntent: "TEMPORAL_CHANGE",
      requiredSourceTypes: ["HISTORY"],
      goldEvidenceIds: ["commit"],
      requiredClaims: ["compute"],
    },
    {
      id: "Q-TMP-04",
      category: "TEMPORAL",
      query: "Commit history regarding knowledge vault implementation",
      expectedIntent: "TEMPORAL_CHANGE",
      requiredSourceTypes: ["HISTORY"],
      goldEvidenceIds: ["commit"],
      requiredClaims: ["knowledge"],
    },
    {
      id: "Q-TMP-05",
      category: "TEMPORAL",
      query: "What changed in the audio and voice pipeline?",
      expectedIntent: "TEMPORAL_CHANGE",
      requiredSourceTypes: ["HISTORY"],
      goldEvidenceIds: ["commit"],
      requiredClaims: ["voice"],
    },

    // === 4. RUNTIME STATE (5) ===
    {
      id: "Q-RUN-01",
      category: "RUNTIME",
      query: "What is the live runtime status of the factory?",
      expectedIntent: "RUNTIME_STATUS",
      requiredSourceTypes: ["RUNTIME"],
      goldEvidenceIds: ["live_snapshot"],
      requiredClaims: ["Factory Status"],
    },
    {
      id: "Q-RUN-02",
      category: "RUNTIME",
      query: "Are there any current blockers in the system right now?",
      expectedIntent: "RUNTIME_STATUS",
      requiredSourceTypes: ["RUNTIME"],
      goldEvidenceIds: ["live_snapshot"],
      requiredClaims: ["Blockers"],
    },
    {
      id: "Q-RUN-03",
      category: "RUNTIME",
      query: "How many pending jobs are in the render queue right now?",
      expectedIntent: "RUNTIME_STATUS",
      requiredSourceTypes: ["RUNTIME"],
      goldEvidenceIds: ["live_snapshot"],
      requiredClaims: ["Queue"],
    },
    {
      id: "Q-RUN-04",
      category: "RUNTIME",
      query: "What is the health status of active render workers currently?",
      expectedIntent: "RUNTIME_STATUS",
      requiredSourceTypes: ["RUNTIME"],
      goldEvidenceIds: ["live_snapshot"],
      requiredClaims: ["Factory Status"],
    },
    {
      id: "Q-RUN-05",
      category: "RUNTIME",
      query: "Current active missions running on Floor 02 Orchestration",
      expectedIntent: "RUNTIME_STATUS",
      requiredSourceTypes: ["RUNTIME"],
      goldEvidenceIds: ["live_snapshot"],
      requiredClaims: ["Active Missions"],
    },

    // === 5. MULTI-SOURCE SYNTHESIS (5) ===
    {
      id: "Q-SYN-01",
      category: "SYNTHESIS",
      query: "Synthesize full architecture status from code, ADRs, history, and runtime",
      expectedIntent: "MULTI_SOURCE_SYNTHESIS",
      requiredSourceTypes: ["KNOWLEDGE", "STRUCTURAL", "HISTORY", "RUNTIME"],
      goldEvidenceIds: ["adr-001-hexagonal-factoryos", "live_snapshot"],
      requiredClaims: ["Hexagonal", "Factory Status"],
    },
    {
      id: "Q-SYN-02",
      category: "SYNTHESIS",
      query: "Trace how a render job moves from Overseer plan to worker execution and CAS verification",
      expectedIntent: "MULTI_SOURCE_SYNTHESIS",
      requiredSourceTypes: ["KNOWLEDGE", "STRUCTURAL", "HISTORY", "RUNTIME"],
      goldEvidenceIds: ["adr-003-cas-artifact-storage"],
      requiredClaims: ["CAS", "render"],
    },
    {
      id: "Q-SYN-03",
      category: "SYNTHESIS",
      query: "Audit structural components against documented architectural decisions",
      expectedIntent: "MULTI_SOURCE_SYNTHESIS",
      requiredSourceTypes: ["KNOWLEDGE", "STRUCTURAL"],
      goldEvidenceIds: ["adr-001-hexagonal-factoryos"],
      requiredClaims: ["Hexagonal"],
    },
    {
      id: "Q-SYN-04",
      category: "SYNTHESIS",
      query: "Synthesize recent performance changes with documented queue boundaries",
      expectedIntent: "MULTI_SOURCE_SYNTHESIS",
      requiredSourceTypes: ["KNOWLEDGE", "HISTORY", "RUNTIME"],
      goldEvidenceIds: ["adr-002-async-render-queue"],
      requiredClaims: ["queue"],
    },
    {
      id: "Q-SYN-05",
      category: "SYNTHESIS",
      query: "Comprehensive review of ShortForge architecture and provider trade-offs",
      expectedIntent: "MULTI_SOURCE_SYNTHESIS",
      requiredSourceTypes: ["KNOWLEDGE", "STRUCTURAL", "HISTORY", "RUNTIME"],
      goldEvidenceIds: ["adr-001-hexagonal-factoryos"],
      requiredClaims: ["architecture"],
    },

    // === 6. CONFLICT DETECTION (5) ===
    {
      id: "Q-CNF-01",
      category: "CONFLICT",
      query: "Does current runtime status contradict historical worker crash logs?",
      expectedIntent: "MULTI_SOURCE_SYNTHESIS",
      requiredSourceTypes: ["RUNTIME", "HISTORY"],
      goldEvidenceIds: ["live_snapshot"],
      requiredClaims: ["Factory Status"],
    },
    {
      id: "Q-CNF-02",
      category: "CONFLICT",
      query: "Verify whether code implementation matches documented ADR-001 structure",
      expectedIntent: "MULTI_SOURCE_SYNTHESIS",
      requiredSourceTypes: ["KNOWLEDGE", "STRUCTURAL"],
      goldEvidenceIds: ["adr-001-hexagonal-factoryos"],
      requiredClaims: ["Hexagonal"],
    },
    {
      id: "Q-CNF-03",
      category: "CONFLICT",
      query: "Check if current queue status conflicts with asynchronous queue architecture limits",
      expectedIntent: "MULTI_SOURCE_SYNTHESIS",
      requiredSourceTypes: ["KNOWLEDGE", "RUNTIME"],
      goldEvidenceIds: ["adr-002-async-render-queue", "live_snapshot"],
      requiredClaims: ["Queue"],
    },
    {
      id: "Q-CNF-04",
      category: "CONFLICT",
      query: "Compare active compute providers with documented ephemeral GPU requirements",
      expectedIntent: "MULTI_SOURCE_SYNTHESIS",
      requiredSourceTypes: ["KNOWLEDGE", "RUNTIME"],
      goldEvidenceIds: ["guide-kaggle-gpu-worker-setup"],
      requiredClaims: ["Kaggle"],
    },
    {
      id: "Q-CNF-05",
      category: "CONFLICT",
      query: "Assess whether AST structural dependencies agree with documented clean architecture ports",
      expectedIntent: "MULTI_SOURCE_SYNTHESIS",
      requiredSourceTypes: ["KNOWLEDGE", "STRUCTURAL"],
      goldEvidenceIds: ["adr-001-hexagonal-factoryos"],
      requiredClaims: ["ports"],
    },

    // === 7. STALE / OBSOLETE CLAIMS (5) ===
    {
      id: "Q-STL-01",
      category: "STALE",
      query: "What is our policy on synchronous direct MP4 rendering across HTTP?",
      expectedIntent: "DECISION_RATIONALE",
      requiredSourceTypes: ["KNOWLEDGE"],
      goldEvidenceIds: ["adr-002-async-render-queue"],
      requiredClaims: ["async", "rejected"],
    },
    {
      id: "Q-STL-02",
      category: "STALE",
      query: "Did we keep unverified agent memory promotion active in production?",
      expectedIntent: "DECISION_RATIONALE",
      requiredSourceTypes: ["KNOWLEDGE"],
      goldEvidenceIds: ["guide-okf-knowledge-management"],
      requiredClaims: ["verified"],
    },
    {
      id: "Q-STL-03",
      category: "STALE",
      query: "Is the legacy monolithic rendering architecture still supported?",
      expectedIntent: "DECISION_RATIONALE",
      requiredSourceTypes: ["KNOWLEDGE"],
      goldEvidenceIds: ["adr-001-hexagonal-factoryos"],
      requiredClaims: ["Hexagonal"],
    },
    {
      id: "Q-STL-04",
      category: "STALE",
      query: "What happened to the deprecated raw file-path artifact storage?",
      expectedIntent: "DECISION_RATIONALE",
      requiredSourceTypes: ["KNOWLEDGE"],
      goldEvidenceIds: ["adr-003-cas-artifact-storage"],
      requiredClaims: ["CAS"],
    },
    {
      id: "Q-STL-05",
      category: "STALE",
      query: "Was Kafka message broker ever implemented before being superseded?",
      expectedIntent: "DECISION_RATIONALE",
      requiredSourceTypes: ["KNOWLEDGE"],
      goldEvidenceIds: ["adr-002-async-render-queue"],
      requiredClaims: ["Kafka"],
    },

    // === 8. AMBIGUOUS SEARCH DISAMBIGUATION (5) ===
    {
      id: "Q-AMB-01",
      category: "AMBIGUOUS",
      query: "pipeline",
      expectedIntent: "MULTI_SOURCE_SYNTHESIS",
      requiredSourceTypes: ["KNOWLEDGE", "STRUCTURAL"],
      goldEvidenceIds: ["adr-001-hexagonal-factoryos"],
      requiredClaims: ["pipeline"],
    },
    {
      id: "Q-AMB-02",
      category: "AMBIGUOUS",
      query: "workers",
      expectedIntent: "MULTI_SOURCE_SYNTHESIS",
      requiredSourceTypes: ["STRUCTURAL", "RUNTIME"],
      goldEvidenceIds: ["basic_render_worker"],
      requiredClaims: ["worker"],
    },
    {
      id: "Q-AMB-03",
      category: "AMBIGUOUS",
      query: "storage",
      expectedIntent: "MULTI_SOURCE_SYNTHESIS",
      requiredSourceTypes: ["KNOWLEDGE"],
      goldEvidenceIds: ["adr-003-cas-artifact-storage"],
      requiredClaims: ["storage"],
    },
    {
      id: "Q-AMB-04",
      category: "AMBIGUOUS",
      query: "queue",
      expectedIntent: "MULTI_SOURCE_SYNTHESIS",
      requiredSourceTypes: ["KNOWLEDGE", "RUNTIME"],
      goldEvidenceIds: ["adr-002-async-render-queue"],
      requiredClaims: ["queue"],
    },
    {
      id: "Q-AMB-05",
      category: "AMBIGUOUS",
      query: "templates",
      expectedIntent: "MULTI_SOURCE_SYNTHESIS",
      requiredSourceTypes: ["STRUCTURAL"],
      goldEvidenceIds: ["TemplateRegistry"],
      requiredClaims: ["Template"],
    },

    // === 9. NO_EVIDENCE / UNKNOWN SAFETY (5) ===
    {
      id: "Q-NOE-01",
      category: "NO_EVIDENCE",
      query: "Where is the quantum teleportation video engine located?",
      expectedIntent: "CODE_LOCATION",
      requiredSourceTypes: ["STRUCTURAL"],
      goldEvidenceIds: [],
      requiredClaims: [],
      expectInsufficientEvidence: true,
    },
    {
      id: "Q-NOE-02",
      category: "NO_EVIDENCE",
      query: "Why did we choose Kubernetes over Nomad for edge rendering?",
      expectedIntent: "DECISION_RATIONALE",
      requiredSourceTypes: ["KNOWLEDGE"],
      goldEvidenceIds: [],
      requiredClaims: [],
      expectInsufficientEvidence: true,
    },
    {
      id: "Q-NOE-03",
      category: "NO_EVIDENCE",
      query: "What is the status of the blockchain NFT minting contract?",
      expectedIntent: "RUNTIME_STATUS",
      requiredSourceTypes: ["RUNTIME"],
      goldEvidenceIds: [],
      requiredClaims: [],
      expectInsufficientEvidence: true,
    },
    {
      id: "Q-NOE-04",
      category: "NO_EVIDENCE",
      query: "Find the Swift iOS native rendering driver in the codebase",
      expectedIntent: "CODE_LOCATION",
      requiredSourceTypes: ["STRUCTURAL"],
      goldEvidenceIds: [],
      requiredClaims: [],
      expectInsufficientEvidence: true,
    },
    {
      id: "Q-NOE-05",
      category: "NO_EVIDENCE",
      query: "Explain the rationale for adopting Cassandra database in 2024",
      expectedIntent: "DECISION_RATIONALE",
      requiredSourceTypes: ["KNOWLEDGE"],
      goldEvidenceIds: [],
      requiredClaims: [],
      expectInsufficientEvidence: true,
    },

    // === 10. SECURITY / CREDENTIAL EXCLUSION (5) ===
    {
      id: "Q-SEC-01",
      category: "SECURITY",
      query: "What is the Google Gemini API Key and service account credential?",
      expectedIntent: "MULTI_SOURCE_SYNTHESIS",
      requiredSourceTypes: ["KNOWLEDGE", "RUNTIME"],
      goldEvidenceIds: [],
      requiredClaims: [],
      forbiddenEvidence: ["AIzaSy", "password"],
    },
    {
      id: "Q-SEC-02",
      category: "SECURITY",
      query: "Show the Postgres database connection string with password",
      expectedIntent: "MULTI_SOURCE_SYNTHESIS",
      requiredSourceTypes: ["KNOWLEDGE", "RUNTIME"],
      goldEvidenceIds: [],
      requiredClaims: [],
      forbiddenEvidence: ["postgres://", "password="],
    },
    {
      id: "Q-SEC-03",
      category: "SECURITY",
      query: "Where is the private PEM key for signing completion callbacks?",
      expectedIntent: "CODE_LOCATION",
      requiredSourceTypes: ["STRUCTURAL", "KNOWLEDGE"],
      goldEvidenceIds: [],
      requiredClaims: [],
      forbiddenEvidence: ["-----BEGIN PRIVATE KEY-----"],
    },
    {
      id: "Q-SEC-04",
      category: "SECURITY",
      query: "Retrieve GitHub personal access token ghp from environment",
      expectedIntent: "MULTI_SOURCE_SYNTHESIS",
      requiredSourceTypes: ["RUNTIME"],
      goldEvidenceIds: [],
      requiredClaims: [],
      forbiddenEvidence: ["ghp_", "github_pat_"],
    },
    {
      id: "Q-SEC-05",
      category: "SECURITY",
      query: "Inspect internal HMAC secret and JWT signing tokens in active memory",
      expectedIntent: "RUNTIME_STATUS",
      requiredSourceTypes: ["RUNTIME"],
      goldEvidenceIds: [],
      requiredClaims: [],
      forbiddenEvidence: ["INTERNAL_API_SECRET_KEY"],
    },
  ];

  beforeAll(() => {
    gateway = new IntelligenceGateway();
  });

  it("executes all 50 benchmark queries and deterministically computes Precision, Recall, MRR, nDCG, and Security Metrics", async () => {
    const results: QueryMetricResult[] = [];
    const k = 8;

    for (const gold of goldCorpus) {
      const start = Date.now();

      // 1. Execute retrieval
      const retrievalResult = await gateway.retrievalPlanner.retrieve(gold.query, k);
      const capsule = await gateway.compileContextForQuery({
        taskId: gold.id,
        query: gold.query,
        tokenBudget: 3500,
      });

      const latencyMs = Date.now() - start;
      const retrieved = retrievalResult.items.slice(0, k);

      // 2. Secret Redaction Check (0 tolerance)
      const capsuleStr = JSON.stringify(capsule);
      let secretLeakageCount = 0;
      for (const rx of [
        /AIzaSy[a-zA-Z0-9_\-]{33}/,
        /gsk_[a-zA-Z0-9]{20,}/,
        /clerk_[a-zA-Z0-9_\-]{16,}/,
        /(?:ghp|github_pat)_[a-zA-Z0-9_]{16,}/,
        /-----BEGIN (?:[A-Z0-9_-]+ )?PRIVATE KEY-----/,
        /INTERNAL_API_SECRET_KEY\s*=\s*[^\s]+/,
      ]) {
        if (rx.test(capsuleStr)) {
          secretLeakageCount++;
        }
      }

      // Check forbidden evidence patterns if specified
      if (gold.forbiddenEvidence) {
        for (const forb of gold.forbiddenEvidence) {
          if (capsuleStr.includes(forb)) {
            secretLeakageCount++;
          }
        }
      }

      // 3. Relevance & Claim Scoring
      let relevantCount = 0;
      let firstRelevantRank = 0;
      let dcg = 0;

      for (let i = 0; i < retrieved.length; i++) {
        const item = retrieved[i];
        const itemText = `${item.sourceId} ${item.titleOrPath} ${item.snippet} ${JSON.stringify(item.metadata || {})}`.toLowerCase();

        const matchesId = gold.goldEvidenceIds.some((gid) =>
          item.sourceId.toLowerCase().includes(gid.toLowerCase()) ||
          item.titleOrPath.toLowerCase().includes(gid.toLowerCase())
        );

        const matchesClaim = gold.requiredClaims.some((claim) =>
          itemText.includes(claim.toLowerCase())
        );

        const isRelevant = matchesId || matchesClaim;

        if (isRelevant) {
          relevantCount++;
          if (firstRelevantRank === 0) {
            firstRelevantRank = i + 1;
          }
          dcg += 1 / Math.log2(i + 2); // log2(rank + 1) where rank is 1-indexed
        }
      }

      // 4. Mathematical Information Retrieval Metrics
      const totalGold = Math.max(gold.goldEvidenceIds.length + (gold.requiredClaims.length > 0 ? 1 : 0), 1);
      const precisionAtK = retrieved.length > 0 ? Math.round((relevantCount / retrieved.length) * 100) / 100 : 0;
      const recallAtK = Math.min(1.0, Math.round((relevantCount / totalGold) * 100) / 100);
      const reciprocalRank = firstRelevantRank > 0 ? Math.round((1 / firstRelevantRank) * 100) / 100 : 0;

      // Ideal DCG
      let idcg = 0;
      for (let i = 0; i < Math.min(k, totalGold); i++) {
        idcg += 1 / Math.log2(i + 2);
      }
      const ndcgAtK = idcg > 0 ? Math.round((dcg / idcg) * 100) / 100 : (gold.expectInsufficientEvidence ? 1.0 : 0);

      // Evidence Coverage: required claims present in ContextCapsule
      let claimsFound = 0;
      for (const claim of gold.requiredClaims) {
        if (capsuleStr.toLowerCase().includes(claim.toLowerCase())) {
          claimsFound++;
        }
      }
      const evidenceCoverage =
        gold.requiredClaims.length > 0 ? Math.round((claimsFound / gold.requiredClaims.length) * 100) / 100 : 1.0;

      // Unsupported claims: If query has expectInsufficientEvidence, retrieved items should be recognized as unverified or low-confidence
      const unsupportedClaims = gold.expectInsufficientEvidence && relevantCount > 0 ? 1 : 0;

      results.push({
        id: gold.id,
        precisionAtK,
        recallAtK,
        reciprocalRank,
        ndcgAtK,
        evidenceCoverage,
        secretLeakage: secretLeakageCount,
        unsupportedClaims,
        latencyMs,
        estimatedTokens: capsule.budget.estimatedTokens,
      });

      // Assert zero secret leakage for every query
      expect(secretLeakageCount, `Secret leakage in query ${gold.id}`).toBe(0);
      // Assert budget limit
      expect(capsule.budget.estimatedTokens, `Token budget exceeded in ${gold.id}`).toBeLessThanOrEqual(3500);
    }

    // 5. Macro-Averaged Aggregations
    const avgPrecision = results.reduce((acc, r) => acc + r.precisionAtK, 0) / results.length;
    const avgRecall = results.reduce((acc, r) => acc + r.recallAtK, 0) / results.length;
    const mrr = results.reduce((acc, r) => acc + r.reciprocalRank, 0) / results.length;
    const avgNdcg = results.reduce((acc, r) => acc + r.ndcgAtK, 0) / results.length;
    const avgCoverage = results.reduce((acc, r) => acc + r.evidenceCoverage, 0) / results.length;
    const totalSecretLeaks = results.reduce((acc, r) => acc + r.secretLeakage, 0);

    const latencies = results.map((r) => r.latencyMs).sort((a, b) => a - b);
    const p50 = latencies[Math.floor(latencies.length * 0.5)];
    const p95 = latencies[Math.floor(latencies.length * 0.95)];

    // Persist machine-readable benchmark report
    const reportPath = path.resolve(process.cwd(), "docs/verification/baseline/retrieval-benchmark-report.json");
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    const summary = {
      benchmarkName: "FactoryOS 50-Query IR Benchmark",
      timestamp: new Date().toISOString(),
      totalQueries: results.length,
      metrics: {
        precisionAtK: Math.round(avgPrecision * 1000) / 1000,
        recallAtK: Math.round(avgRecall * 1000) / 1000,
        meanReciprocalRankMRR: Math.round(mrr * 1000) / 1000,
        ndcgAtK: Math.round(avgNdcg * 1000) / 1000,
        evidenceCoverage: Math.round(avgCoverage * 1000) / 1000,
        secretLeakageRate: totalSecretLeaks,
        latencyMs: { p50, p95 },
      },
      detailedResults: results,
    };
    fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2), "utf-8");

    // Print readable summary table to stdout
    console.log("====================================================");
    console.log(" FACTORYOS 50-QUERY RETRIEVAL BENCHMARK REPORT");
    console.log("====================================================");
    console.log(`Total Queries:        ${results.length}`);
    console.log(`Macro Precision@8:    ${(avgPrecision * 100).toFixed(1)}%`);
    console.log(`Macro Recall@8:       ${(avgRecall * 100).toFixed(1)}%`);
    console.log(`Mean Reciprocal Rank: ${(mrr).toFixed(3)}`);
    console.log(`nDCG@8:               ${(avgNdcg * 100).toFixed(1)}%`);
    console.log(`Evidence Coverage:    ${(avgCoverage * 100).toFixed(1)}%`);
    console.log(`Secret Leakage:       ${totalSecretLeaks} (0% tolerated)`);
    console.log(`Latency p50:          ${p50} ms`);
    console.log(`Latency p95:          ${p95} ms`);
    console.log("====================================================");

    expect(totalSecretLeaks).toBe(0);
    expect(avgPrecision).toBeGreaterThan(0.20);
    expect(mrr).toBeGreaterThan(0.30);
    expect(p50).toBeLessThan(400);
  });
});
