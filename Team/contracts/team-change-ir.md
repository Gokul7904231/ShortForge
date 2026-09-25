# TeamChangeIR

TeamChangeIR is the semantic intermediate representation used inside the Team workflow.

It is compiled after the mandatory complete .okf sweep and is not a competing governance document.

## Core fields

- changeId
- repository / baseRef / headRef
- changedPaths
- objective
- okfSweep
- sourceOfTruthRefs
- classification
- constraints
- affectedSurfaces
- routedForgers
- securityPlan
- evidenceRefs
- contradictions
- verificationPlan
- disposition
- modelContext

## IR vs JSON

The IR expresses meaning; JSON is a machine-readable encoding of the IR.

Use the same semantic object in three projections:

- **typed IR in memory** — efficient internal orchestration and validation
- **canonical JSON** — transport, persistence, CI gates and reproducible datasets
- **Markdown** — human-facing Forger report

For model calls, Context Compiler emits the smallest sufficient serialized projection from TeamChangeIR rather than the entire .okf corpus.

The full sweep is still mandatory: compact model context is an optimization of transfer, not a waiver of governance.
