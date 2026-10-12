# Repository Mapping: datalab-to / lift

- Repository: https://github.com/datalab-to/lift
- Reviewed ref: master
- Reviewed commit: 1590a27d6cd2e31ac5ea826bd8ceedf07f950d37
- Review date: 2026-10-12
- Code license reported by GitHub: Apache-2.0
- Model-weight license: upstream README identifies a modified OpenRAIL-M license with additional commercial/use restrictions; review the current MODEL_LICENSE before any use.
- Assimilation mode: ISOLATED_PROVIDER / EXPERIMENT_ONLY
- ShortForge status: NOT INTEGRATED; no model, service, or package dependency is added.

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

**EXPERIMENT_ONLY.** First run an isolated benchmark against representative text PDFs, scanned PDFs, multi-column layouts, tables, and figures. Measure field accuracy, citation/region fidelity, schema-valid rate, failure modes, throughput, p50/p95 latency, CPU/GPU/RAM/VRAM, cold-start and operating cost. Compare against the current DocumentNormalizer and other existing document paths. Confirm model artifact size and supported hardware rather than assuming the target runtime can host it.

Before any commercial or production deployment, legal review must separately approve code, model-weight terms, redistribution, on-premise use, and hosted-processing constraints. Until then, the adapter remains disabled and research-only.

Reject/roll back if provenance is lost, untrusted documents can reach arbitrary filesystem/network targets, resource limits are unbounded, extraction quality does not beat baseline, or the licensing model is incompatible.

## Security, privacy, and provenance

Treat documents and extracted strings as hostile input. Enforce byte/page/time limits, path containment, sandboxing, no ambient egress, credential isolation, schema validation, and downstream independent fact verification. Upstream README: https://github.com/datalab-to/lift; it distinguishes Apache-2.0 code from modified OpenRAIL-M model-weight terms.

Reviewed repository metadata, README, and license disclosure at the immutable commit above. This is a clean-room research mapping only: no Lift code, prompt, test, or model weights were copied, downloaded, or run. All quality and hardware claims remain unverified locally.
