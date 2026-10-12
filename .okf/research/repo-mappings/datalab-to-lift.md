# Repository Mapping: datalab-to / lift

- Repository: https://github.com/datalab-to/lift
- Reviewed ref: master
- Reviewed commit: 1590a27d6cd2e31ac5ea826bd8ceedf07f950d37
- Review date: 2026-10-12
- Code license reported by GitHub: Apache-2.0
- Model-weight license: upstream README identifies a modified OpenRAIL-M license with additional commercial/use restrictions; review the current MODEL_LICENSE before any use.
- Assimilation mode: ISOLATED_PROVIDER / EXPERIMENT_ONLY
- ShortForge status: ADAPTER CONTRACT IMPLEMENTED; LIFT PROVIDER/MODEL NOT INTEGRATED.

## Problem and useful mechanism

Lift is described upstream as a schema-directed vision model for extracting structured JSON from PDFs and images. It is a possible candidate for difficult document layouts, scanned pages, figures, and tables that ordinary text normalization does not preserve. Schema-constrained output does not itself prove factual correctness.

## Existing ShortForge implementation and authority

- apps/web/factoryos/core/research/DocumentNormalizer.ts is the existing normalization boundary.
- .okf/research/repo-mappings/microsoft-markitdown.md records the prior decision to keep multi-format document processing isolated and defer broad integration.
- Research ingestion must retain source provenance and must not promote unverified extracted claims into KnowledgeOS as verified facts.

## Patterns considered

- Candidate: expose a narrow adapter behind DocumentNormalizer or a separate isolated worker/provider contract.
- Candidate: accept only a caller-supplied extraction schema; validate the result and preserve page/region/source references where available.
- Rejected: importing Lift into the core Next.js runtime before resource and isolation evaluation; silently routing confidential documents to a hosted service; treating schema-valid output or model confidence as F07 verification; assuming that code-license permissions apply to model weights.

## Status and verification required

**EXPERIMENT_ONLY (opt-in normalization seam implemented; no Lift provider/model connected).** VisualDocumentExtractionAdapter.ts is disabled by default, bounds MIME/input/output/timeout, provides abort signals, validates with a caller-owned Zod schema, records the source SHA-256, and labels output UNVERIFIED. DocumentNormalizer.normalizeWithVision exposes this adapter through the existing normalization boundary only when a caller deliberately supplies an enabled adapter; normalized JSON is escaped as text and output length is bounded. Any APPROVED_REMOTE vision provider additionally requires allowApprovedRemoteProvider=true, and each extraction request must separately set allowRemoteSubmission=true; both gates default closed. No Lift model or weights were downloaded/run and no visual provider is configured. Run an isolated benchmark against representative text/scanned PDFs, multi-column layouts, tables, and figures; measure field/region accuracy, schema-valid rate, failures, throughput, p50/p95 latency, hardware, cold start and cost. Compare with the current normalizer baseline.

Before any commercial or production deployment, legal review must separately approve code, model-weight terms, redistribution, on-premise use, and hosted-processing constraints. Until then, the adapter remains disabled and research-only.

Reject/roll back if provenance is lost, untrusted documents can reach arbitrary filesystem/network targets, resource limits are unbounded, extraction quality does not beat baseline, or the licensing model is incompatible.

## Security, privacy, and licensing

Treat documents and extracted strings as hostile input. Enforce byte/page/time limits, path containment, sandboxing, no ambient egress, credential isolation, schema validation, and downstream independent fact verification. Upstream README: https://github.com/datalab-to/lift; it distinguishes Apache-2.0 code from modified OpenRAIL-M model-weight terms.

## Provenance

Reviewed repository metadata, README, and license disclosure at the immutable commit above. This is a clean-room research mapping only: no Lift code, prompt, test, or model weights were copied, downloaded, or run. All quality and hardware claims remain unverified locally.
