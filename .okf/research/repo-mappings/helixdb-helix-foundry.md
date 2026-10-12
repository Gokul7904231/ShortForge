# Repository Mapping: HelixDB / Helix Foundry

- Repository: https://github.com/HelixDB/helix-foundry
- Reviewed ref: main
- Reviewed commit: 9780d74c85631a36bfdc545e105ffd7786477e63
- Review date: 2026-10-12
- Code license reported by GitHub: Apache-2.0
- Assimilation mode: PATTERN_EXTRACTION / RESEARCH_ONLY
- ShortForge status: NOT INTEGRATED; no Helix Foundry runtime dependency is added by this mapping.

## Problem and useful mechanism

Helix Foundry describes a local-first workspace that connects distinct data sources into an inspectable ontology. The useful reference pattern is not “add another database”; it is to make relationships between source records and derived knowledge explicit while preserving source identity and inspectability.

## Existing ShortForge authority and fit

Relevant existing surfaces include:

- apps/web/factoryos/core/knowledge/KnowledgeOS.ts and its contracts.
- Memory Fabric and the existing Context Fabric / KnowledgeOS boundary.
- .okf/research/source-provenance.md.
- Existing EvidenceGraphIR and typed evidence/receipt patterns documented by .okf/research/repo-mappings/tt-a1i-archify.md.

KnowledgeOS, Memory Fabric, and the existing evidence contracts remain canonical. This mapping authorizes no competing ontology store, second memory database, or second graph IR.

## Patterns considered

- Candidate: model source-to-claim-to-evidence relationships with stable identifiers and provenance.
- Candidate: version snapshots and deterministic diffs over existing canonical knowledge records, if an audited gap is found.
- Candidate: support relationship traversal as a projection/query over existing canonical storage rather than a new authority.
- Not adopted: replacing KnowledgeOS or Memory Fabric with HelixDB/DuckDB; copying adapters, code, schemas, assets, or test suites; treating local-first as proof of data safety.

## Status and verification required

**RESEARCH_ONLY.** Existing ShortForge graph/evidence patterns already cover part of the need, but a Helix-specific implementation is not present or claimed. Before any implementation, audit the current KnowledgeOS/Memory Fabric snapshot and provenance contracts to demonstrate the exact missing capability.

Acceptance evidence must include source-linked records, deterministic snapshot/diff tests, relationship referential integrity, promotion-barrier tests for unverified claims, access control, backup/recovery behavior, and proof that no parallel store or IR was introduced. Revert/reject the change if it duplicates canonical authority or weakens evidence provenance.

## Security, performance, and licensing

Connected sources are untrusted input boundaries. Enforce tenant/workspace scoping, least-privilege connector credentials, bounded imports, secret redaction, source freshness, and auditable deletion/retention. Measure query/build latency and storage costs before any materialization. The upstream repository reports Apache-2.0 for its code; this is a pattern reference only, and no upstream code has been copied.

## Provenance

Reviewed the public repository metadata and README at the immutable commit above. Upstream: https://github.com/HelixDB/helix-foundry. No ShortForge build, runtime, or test was executed as part of this mapping.
