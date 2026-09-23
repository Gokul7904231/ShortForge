# Repository Mapping: cathrynlavery/diagram-design

- **Repository**: `cathrynlavery/diagram-design`
- **URL**: `https://github.com/cathrynlavery/diagram-design`
- **Owner**: `cathrynlavery`
- **Reviewed Version**: `main` (Snapshot 2026)
- **Date Studied**: `2026-09-09`
- **Upstream License**: `MIT`
- **Adoption Mode**: `PATTERN_EXTRACTION`
- **Implementation Status**: `ADOPTED`

---

## 1. Problem Solved
Technical diagrams and system graphs often become cluttered, overwhelming visual "spaghetti" when every node and edge is given equal visual weight, obscuring the primary failure point, critical path, or operational bottleneck.

## 2. Important Mechanisms
- Progressive disclosure: separating high-level structural topology from micro-level component internals.
- Semantic grammar over arbitrary geometry: visual symbols represent specific system semantics (dataflow vs command vs boundary vs state).
- Complexity control via deliberate deletion: hiding non-essential peripheral nodes to spotlight the focal point.
- Visual hierarchy and focal emphasis: styling key actors, failures, or blockers with prominent visual cues.

## 3. FactoryOS Mapping
- **FactoryOS Concept**: Semantic Presentation Planning, Progressive Disclosure, Semantic Navigation Stack, and Complexity Control.
- **FactoryOS Destination**:
  - `testing/graphs/GraphPresentationPlanner.ts`
  - `testing/graphs/GraphProjections.ts`
  - `testing/graphs/visual/GraphNavigationState.ts` (Deterministic navigation stack preserving canonical context)
  - `testing/graphs/visual/CyclePresentationPlanner.ts` (Explicit CYCLIC SUBGRAPH representation)
  - `testing/graphs/visual/DeterministicGraphRenderer.ts` (Accessible tokens, dual-encoded badges/shapes, keyboard actions)
- **Existing Agents/Capabilities Affected**:
  - `OverseerControlPlane`: Receives high-level operational overview, blocking path, and semantic drilldown.
  - `SlayerEngine`: Receives focused forensic breakdown from failure origin to root cause without reachability-only false causality.
  - `GuardianManager`: Receives floor boundary and invariant health projections.

## 4. What Was Adopted
- Clean separation between the underlying graph IR (`SituationGraphIR`, `MissionGraph`) and the presentation planner (`GraphPresentationPlanner`).
- Detail levels (`OVERVIEW`, `FOCUSED_DETAIL`, `FORENSIC`, `DEPENDENCY`, `EVIDENCE_DRILLDOWN`).
- Progressive disclosure: bounding visual subgraphs to complexity budget (e.g. 15 nodes) and pruning unrelated telemetry.
- Semantic navigation stack tracking current view, parent view, subject, and selection reason.
- Explicit cycle identification and visualization retaining members, entry nodes, and retry metadata.
- Accessible patterns: pairing colors with shapes, icons, and text badges so color is never the sole information carrier.

## 5. What Was NOT Adopted
- Did NOT adopt client-side visual layout code directly; only semantic presentation planning logic was extracted.
- Did NOT allow visual layout engines to dictate graph truth—underlying graph IR and evidence remain authoritative.

## 6. Security & Licensing Considerations
- MIT License. Architectural pattern adopted clean-room without copying third-party SVG or CSS assets.

## 7. Validation Performed
- Tested graph projections (`OverseerView`, `SlayerView`) to verify that dense execution graphs are pruned cleanly according to consumer role.
