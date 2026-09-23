# Intelligence: Continuous Evaluation & Benchmark Suite

> **Status**: OPERATIONAL / CANONICAL  
> **Source Location**: `apps/web/factoryos/tests/quiz-eval.test.ts` & `apps/web/factoryos/core/verification/`

---

## 1. Architectural Philosophy: Evaluation-Driven Development

In FactoryOS, autonomous agents and generative models cannot be trusted without objective, empirical verification. A model's outputs must be continually evaluated against ground-truth oracles, deterministic grading rubrics, and formal semantic constraints.

Evaluation in FactoryOS serves two essential roles:
1. **Pre-Production Gating**: Prompt templates, model routing weights, and pipeline heuristics cannot be merged or deployed without passing regression benchmark suites.
2. **Runtime Quality Assurance (Floor 07)**: Every generated artifact (script, beat sheet, asset manifest, timeline, render output) is graded against deterministic contracts and statistical quality thresholds prior to release.

```
┌────────────────────────────────────────────────────────┐
│                   Synthesis Candidate                  │
│       (Script, Quiz Beat Sheet, Research Findings)     │
└───────────────────────────┬────────────────────────────┘
                            │ Candidate Output Payload
                            ▼
┌────────────────────────────────────────────────────────┐
│             Continuous Evaluation Harness              │
│  ├── Oracle Truth Grounding Verification               │
│  ├── Semantic Ambiguity & Contradiction Detection      │
│  ├── Formatting & Schema Constraint Compliance         │
│  └── Pacing, Rhythm & Retention Model Scoring          │
└───────────────────────────┬────────────────────────────┘
                            │ Graded Metric Scorecard
                            ▼
┌────────────────────────────────────────────────────────┐
│                   Evaluation Gate                      │
│     Pass: Score >= Threshold (Release / Proceed)       │
│     Fail: Emit Structured Findings -> Healer Loop      │
└────────────────────────────────────────────────────────┘
```

---

## 2. CURRENT vs TARGET Architecture Status

| Architectural Dimension | CURRENT Implementation | TARGET Implementation |
|:------------------------|:-----------------------|:----------------------|
| **Quiz & Script Eval** | Built-in test suite in `apps/web/factoryos/tests/quiz-eval.test.ts` | Multi-agent debate grading harness with cross-model adversarial probing |
| **Ground-Truth Verification** | Factual support checking against ingested `ResearchPassport` evidence | Automated integration with external fact verification engines & vector graphs |
| **Contradiction Detection** | Deterministic pairwise statement check across narrative beats | Formal logic theorem prover checking script consistency against world model |
| **Evaluation Reporting** | Structured findings (`Finding`, `severity`, `rule`, `evidence`) | Automated evaluation dashboard with drift detection and regression alerts |
| **Release Gating** | 90% decision accuracy threshold in CI/CD pipeline | Automatic Canary deployment gating linked to real-time viewer retention analytics |

---

## 3. Evaluation Dimensions & Metrics

The FactoryOS benchmark suite grades candidate outputs across 5 core dimensions:

### 1. Factual Support Accuracy
- **Definition**: The percentage of factual assertions in the generated script that are strictly grounded in verified research evidence (`ResearchPassport`).
- **Target**: 100% for documentary / educational formats; >= 95% for general infotainment.
- **Fail Condition**: Any unverified claim presented as an established fact triggers an immediate severity `HIGH` finding.

### 2. Contradiction Detection
- **Definition**: Identification of conflicting claims within the script or between visual cues and narration.
- **Rule Example**: `SCRIPT_CONSISTENCY_NO_CONTRADICTIONS`
- **Verification**: Pairwise semantic analysis of all beat assertions.

### 3. Semantic Ambiguity
- **Definition**: Ambiguity in question formulation, multiple plausible interpretations in quiz setups, or ambiguous pronoun references that confuse viewers.
- **Rule Example**: `QUIZ_QUESTION_UNAMBIGUOUS`
- **Threshold**: Requires unambiguous distinction between correct and distractor answers.

### 4. Pacing & Audio-Visual Alignment
- **Definition**: Synchronization between spoken dialogue syllables and visual track transitions.
- **Rule Example**: `TIMELINE_TRACK_SYNC_ACCURACY`
- **Threshold**: Audio speech duration must match timeline clip duration within ±100ms.

### 5. Retention Model Scoring
- **Definition**: Analysis of script hook placement, question reveal timing, and pattern interrupts.
- **Tagging**: All retention metrics must be tagged with explicit provenance (`HEURISTIC_ESTIMATE`, `MODEL_INFERENCE`, or `OBSERVED_MEASUREMENT`).

---

## 4. Grading Oracles & Structured Findings

When an evaluation gate detects a defect, it does not throw an unstructured error. Instead, it emits a standardized **Finding** conforming to `StructuredFindings.ts`:

```typescript
export interface Finding {
  readonly id: string;
  readonly severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  readonly category: 'COMPLIANCE' | 'AUDIO_VISUAL' | 'CONTENT_SAFETY' | 'METRIC_VALIDATION' | 'SYSTEM_INTEGRITY';
  readonly rule: string;
  readonly description: string;
  readonly floorId: FloorId;
  readonly targetArtifactId: string;
  readonly expected: string;
  readonly observed: string;
  readonly evidenceReceiptId?: string;
  readonly supportedRepairs: readonly string[];
}
```

Findings are ingested directly by the Floor 07 orchestrator and passed to the **Healer** subsystem for bounded repair or human escalation.
