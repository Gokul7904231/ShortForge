# ShortForge / FactoryOS — Remediation & Lineage Audit

## 1. Targeted Remediation Case Contract

Remediation in ShortForge avoids costly and indiscriminate whole-factory resets by generating structured, targeted `RemediationCase` contracts:
- `caseId`: Unique remediation identifier.
- `policyId` & `gateId`: The exact violated rule and gate.
- `severity`: `REPAIRABLE` or `EXTERNAL_REVIEW`.
- `targetStages`: The smallest set of production stages requiring modification (e.g. `["02-screenplay"]`, `["05-sound-design"]`, or `["08-packaging"]`).
- `allowedActions`: Allowed transformation methods.
- `forbiddenActions`: Prohibited shallow workarounds (e.g. superficial synonym swapping, pitching audio up 2% to bypass Content ID).

Evidence: Proven in `apps/web/factoryos/tests/youtube-remediation.test.ts` (Test #1) and `apps/web/factoryos/tests/f07-architectural-invariants.test.ts` (Invariant #25).

---

## 2. Directed Acyclic Graph (DAG) Artifact Lineage

The production pipeline is represented as an explicit Directed Acyclic Graph:

```
[01-Ideation / Genome]
         │
         ▼
  [02-Screenplay] ───────────────┐
         │                       │
         ▼                       ▼
   [03-Voiceover]         [04-Visual Prompt]
         │                       │
         ▼                       ▼
  [05-Sound Design]       [06-Rendering]
         │                       │
         └───────────┬───────────┘
                     ▼
             [07-Assembly / Video]
                     │
                     ▼
             [08-Packaging / Meta]
```

When an upstream stage is repaired, the `ArtifactLineageGraph` performs topological downstream traversal to compute all affected descendants:
```typescript
const downstreamStages = lineageGraph.getDownstreamStages(targetStage);
```

Evidence: Proven in `apps/web/factoryos/tests/f07-architectural-invariants.test.ts` (Invariant #26).

---

## 3. Cascade Evidence & Artifact Invalidation

When an upstream artifact is modified or regenerated during remediation:
1. All downstream artifacts in the lineage DAG are marked invalidated.
2. All prior verification findings and `EvidenceRef` items tied to those downstream stages are invalidated in `EvidenceInvalidationTracker`.
3. Downstream stages must be re-executed and re-verified.
4. Attempting to publish with invalidated evidence fails closed at G14 (Evidence Reconciliation Gate).

Evidence: Proven in `apps/web/factoryos/tests/youtube-remediation.test.ts` (Test #3) and `apps/web/factoryos/tests/f07-architectural-invariants.test.ts` (Invariant #26).

---

## 4. Scoped Engine Boundary & Exhaustion Handling

ShortForge strictly restricts automated production to **11 Approved Content Engines**:
1. `Philosophy & Stoicism`
2. `Historical Paradoxes`
3. `Science & Mind-Bending Facts`
4. `Biographies & Human Achievement`
5. `Psychological Experiments & Human Behavior`
6. `True Crime & Forensic Mini-Mysteries`
7. `Economics & Financial Curiosities`
8. `Engineering Feats & Architectural Marvels`
9. `Mythology, Folklore & Ancient Lore`
10. `Language, Linguistics & Etymology`
11. `Geography & Unexplained Places`

**Prohibited Engines**: TV/movie clipping, Reddit raw TTS reading, compilation spam.
**Exhaustion Behavior**: When all candidate blueprint variations are exhausted, the planner returns `NO_VALID_VARIATION` and fails closed. It **never** silently falls back to unapproved engines or duplicate scripts.

Evidence: Proven in `apps/web/factoryos/tests/youtube-content-variation.test.ts` (Tests #1, #2, #4) and `apps/web/factoryos/tests/f07-architectural-invariants.test.ts` (Invariant #22).
