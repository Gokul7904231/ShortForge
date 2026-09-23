# Intelligence: Continuous Evaluation & Benchmark Suite

> **Status**: OPERATIONAL  
> **Location**: `apps/web/factoryos/tests/quiz-eval.test.ts`  

---

## 1. Automated Evaluation Gates
FactoryOS incorporates built-in benchmark datasets to objectively grade agent synthesis accuracy:
- **Factual Support Accuracy**: Checks veracity of synthesized statements against validated ground-truth records.
- **Contradiction Detection**: Flags self-contradictory logic or conflicting timeline events.
- **Semantic Ambiguity**: Flags vague quiz questions or double-meaning answer choices.
- **Threshold**: Requires >= 90% decision accuracy before releasing new agent prompts or engine schemas to production.
