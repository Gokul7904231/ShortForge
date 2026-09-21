# Repository Mapping: tt-a1i/archify

- **Repository**: `tt-a1i/archify`
- **URL**: `https://github.com/tt-a1i/archify`
- **Owner**: `tt-a1i`
- **Reviewed Version**: `main` (Snapshot 2026)
- **Date Studied**: `2026-09-09`
- **Upstream License**: `MIT`
- **Adoption Mode**: `CLEAN_ROOM_REIMPLEMENTATION + PATTERN_EXTRACTION`
- **Implementation Status**: `ADOPTED`

---

## 1. Problem Solved
AI-generated technical artifacts and diagrams often hallucinate unsupported structures, lack grounding in real code, contain illegal relationships, fail validation silently, and trigger unbounded "try again" repair loops without evidence receipts or baseline protection.

## 2. Important Mechanisms
- Strongly typed Intermediate Representation (IR) validated before rendering or commit.
- Strict schema validation that rejects unexpected fields and structural contradictions.
- Grounded evidence receipts: every node, relationship, or claim points to authoritative repository/runtime proof.
- Structured diagnostics (`Finding` model): explicit `id`, `rule`, `severity`, `subject`, `evidence`, `expected`, `observed`, `rootCause`, and `supportedRepairs`.
- Bounded repair loop: track repair rounds, candidate score delta, and stop immediately if no improvement.
- Last-good state baseline: a failed candidate evaluation NEVER overwrites the trusted baseline.

## 3. FactoryOS Mapping
- **FactoryOS Concept**: Graph IR, Evidence Grounding, Structured Diagnostics, Evaluation Receipts, and V2 InteractionIR with Explain Edge.
- **FactoryOS Destination**:
  - `testing/graphs/MissionGraph.ts` (Typed IR for mission execution)
  - `testing/graphs/EvidenceGraph.ts` (Authoritative evidence links)
  - `testing/graphs/visual/InteractionIR.ts` (Typed interaction contract: Explain Edge, Inspector, Receipts)
  - `testing/graphs/visual/EdgeExplanationResolver.ts` (Authoritative Explain Edge grounding)
  - `testing/graphs/visual/NodeInspectionResolver.ts` (Canonical node resolution)
  - `testing/graphs/visual/ArtifactInspectionResolver.ts` (Physical disk & byte inspection)
  - `testing/graphs/visual/BrowserEvidenceResolver.ts` (Sanitized browser evidence resolution)
  - `testing/graphs/visual/VisualizationInteractionResolver.ts` (Interaction dispatch and receipts)
  - `testing/graphs/GraphValidator.ts` (Deterministic schema and edge validation)
  - `testing/graphs/GraphDiff.ts` (Deterministic delta and snapshot comparison)
  - `testing/model/Finding.ts` (Structured diagnostics model)
  - `testing/model/Receipt.ts` (Evaluation receipts)
  - `testing/reports/MissionReport.ts` (Last-known-good tracking and repair receipts)
- **Existing Agents/Capabilities Affected**:
  - `SlayerEngine`: Consumes structured findings with evidence chains and interactive forensic drilldown.
  - `HealerEngine`: Executes bounded repairs guided by `supportedRepairs` without infinite mutation.
  - `OverseerControlPlane`: Evaluates mission health against last-known-good baseline and inspects active blockers.

## 4. What Was Adopted
- Typed Graph IR (`MissionGraphIR`, `EvidenceGraphIR`, `SituationGraphIR`).
- Interaction IR (`InteractionIR`) establishing typed, schema-first operational investigation actions.
- The "Explain Edge" grounding pattern resolving from/to endpoints, planned vs observed execution, physical bytes, SHA-256 digests, and probe evidence.
- Deterministic Graph Validator rejecting illegal edges, dangling references, and ungrounded claims.
- The Archify `Finding` diagnostic schema with explicit evidence grounding and confidence scores.
- Bounded repair control: baseline → diagnose → candidate → compare → accept/reject.
- Last-known-good baseline protection pattern.

## 5. What Was NOT Adopted
- Did NOT import Archify's diagram-specific presentation code (which is tailored to static architecture diagrams).
- Did NOT adopt Archify's AST parser directly; FactoryOS uses native runtime event buses, physical file inspectors, and `ffprobe`.

## 6. Security & Licensing Considerations
- MIT License. Clean-room TypeScript reimplementation from first principles. Zero third-party source files copied.

## 7. Validation Performed
- Validated typed IR schemas, deterministic edge validation, graph diffs, and structured finding generation in testing suite.
