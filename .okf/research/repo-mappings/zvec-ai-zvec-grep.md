# Repository Mapping: zvec-ai / zvec-grep

- Repository: https://github.com/zvec-ai/zvec-grep
- Reviewed ref: main
- Reviewed commit: 49e11642f0fd8817407102fdb5696b1a48283412
- Review date: 2026-10-12
- Code license reported by GitHub: Apache-2.0
- Assimilation mode: BENCHMARK_FIRST / EXPERIMENT_ONLY
- ShortForge status: CLEAN-ROOM EXACT/BM25 CANDIDATE + BENCHMARK RUNNER IMPLEMENTED; OPTIONAL SEMANTIC SCORER GATED; ZVEC-GREP NOT INTEGRATED.

## Problem and useful mechanism

zvec-grep describes local-first workspace search combining ripgrep-style exact matching, BM25, and vector search. It is a plausible evaluation candidate for Devourer and repository research where exact identifiers, keyword ranking, and semantic recall have different strengths.

## Existing ShortForge implementation and authority

- Reach and Devourer already have research/retrieval responsibilities and provider boundaries.
- Existing Memory Fabric/KnowledgeOS stores and provenance rules remain authoritative.
- CAP_VECTOR_SEARCH is an existing capability vocabulary item; its presence does not prove a particular vector backend has been qualified for this task.
- Existing repository search and provider integrations must be used as the benchmark baseline before adding another retrieval runtime.

## Patterns considered

- Candidate: hybrid retrieval combining exact path/symbol search, lexical relevance, and semantic ranking behind the current retrieval contract.
- Candidate: provenance-bearing results with repository revision, path, snippet/line locator, index timestamp, and content digest.
- Rejected: immediately replacing the current retrieval path, indexing secrets or ignored files, using semantic similarity as a substitute for exact identifier lookup, or merging untrusted remote results into verified knowledge without source review.
- Rejected: adding a second durable knowledge store merely because the upstream tool includes local indexing.

## Status and verification required

**EXPERIMENT_ONLY; REAL JUDGED CORPUS BENCHMARK NOT RUN.** HybridKnowledgeRetrievalProvider.ts implements clean-room exact identifier/path ranking plus BM25 with reciprocal-rank fusion and an optional injected semantic re-ranker. Remote semantic scoring requires both provider-level approval and per-query allowRemoteSemanticSubmission=true; both default closed. When authorized, the scorer receives a bounded shortlist (default 50, maximum 200 documents) with each candidate text capped at 8,000 characters by default (hard maximum 32,768), rather than full documents or the full corpus. The existing KnowledgeStoreRetrievalProvider.ts is the baseline; both filter canonical secret findings and duplicate IDs, and attach per-document SHA-256 content revisions. benchmark-knowledge-retrieval.ts and npm run factoryos:eval:knowledge-retrieval validate human-judged cases, run baseline and candidate on identical queries, report recall@k/MRR/exact hits/provenance/latency/errors, and apply numeric gates. Tests use synthetic fixtures only. The CLI does not configure a semantic scorer, and no zvec-grep adapter or real ShortForge judged dataset has run. The result is eligible only for human review; it never authorizes promotion.

Do not integrate until the hybrid mode shows a repeatable improvement over baseline without unacceptable resource or leakage regressions. The system must honor ignore rules, explicit secret exclusions, workspace boundaries, and source policy. Retrieved text remains untrusted and cannot directly authorize tools or promote claims.

## Security, privacy, and licensing

Keep indexes workspace-scoped and rebuildable; never store credential contents in embeddings or logs. Ensure deterministic deletion/refresh and expose index freshness. Apache-2.0 is the upstream code license; no code or model has been copied or integrated.

## Provenance

Reviewed repository metadata and README at the immutable commit above. Upstream: https://github.com/zvec-ai/zvec-grep. The upstream project and its benchmarks were not executed against ShortForge; all comparative performance claims are unproven.
