# Repository Mapping: zvec-ai / zvec-grep

- Repository: https://github.com/zvec-ai/zvec-grep
- Reviewed ref: main
- Reviewed commit: 49e11642f0fd8817407102fdb5696b1a48283412
- Review date: 2026-10-12
- Code license reported by GitHub: Apache-2.0
- Assimilation mode: BENCHMARK_FIRST / EXPERIMENT_ONLY
- ShortForge status: NOT INTEGRATED; no runtime package or index is enabled by this mapping.

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

## Status and qualification gate

**EXPERIMENT_ONLY; BENCHMARK NOT RUN.** Build a reproducible evaluation set from ShortForge tasks and compare baseline retrieval versus exact-only, BM25-only, vector-only, and hybrid modes. Track recall@k, MRR or nDCG, exact identifier/path hit rate, stale-index behavior, index update cost, p50/p95 query latency, memory/disk footprint, provenance completeness, and retrieval-induced false-positive/secret leakage. Include changed files, deleted paths, private configuration, and malicious repository content in negative tests.

Do not integrate until the hybrid mode shows a repeatable improvement over baseline without unacceptable resource or leakage regressions. The system must honor ignore rules, explicit secret exclusions, workspace boundaries, and source policy. Retrieved text remains untrusted and cannot directly authorize tools or promote claims.

## Security, privacy, and licensing

Keep indexes workspace-scoped and rebuildable; never store credential contents in embeddings or logs. Ensure deterministic deletion/refresh and expose index freshness. Apache-2.0 is the upstream code license; no code or model has been copied or integrated.

## Provenance

Reviewed repository metadata and README at the immutable commit above. Upstream: https://github.com/zvec-ai/zvec-grep. The upstream project and its benchmarks were not executed against ShortForge; all comparative performance claims are unproven.
