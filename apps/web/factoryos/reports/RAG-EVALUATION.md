# FactoryOS v0.1 — RAG Evaluation Report

**Date**: 2026-08-05  
**Version**: 1.0  
**Dataset Size**: 32 questions  

---

## 1. Retrieval Performance Metrics

| Retriever | Recall@1 | Recall@3 | Recall@5 | MRR |
|---|---|---|---|---|
| **Vector (Dense Semantic)** | 0.719 | 0.938 | 1.000 | 0.837 |
| **Graph (Knowledge-Graph)** | 0.406 | 0.406 | 0.406 | 0.406 |
| **Hybrid (Linear Fusion)** | 0.719 | 0.906 | 1.000 | 0.831 |

---

## 2. Generative Quality Heuristics

- **Groundedness**: 1.000 (percentage of retrieved items with valid document provenance)
- **Answer Relevance**: 0.325 (entity overlap ratio in retrieved context)
- **Evidence Coverage**: 0.969 (expected document retrieval success rate)

---

## 3. Retrieval Proof Verification

### Semantic Embedding Proof
- **Provider**: LocalVectorEmbeddingProvider
- **Model**: Xenova/all-MiniLM-L6-v2 (ONNX)
- **Embedding Dimensions**: 384
- **Local Execution**: Yes (requires zero network calls after cache warm-up)
- **Paid API / API Keys**: None required

### Independent Semantic Sanity Check
- **Query**: "How does the system continue after a crash without redoing everything?"
- **Lexical Overlap**: Query does not share keyword matches with expected document headings.
- **Retrieved Top Document**: `doc-runtime-readme`
- **Grounded Vector Similarity Match**: SUCCESS

---

## 4. Release Verdict

```
============================================================
RAG RELEASE GATE: PASS
(Hybrid Recall@5 = 1.000 >= 0.80, Hybrid MRR = 0.831 >= 0.65)
============================================================
```
