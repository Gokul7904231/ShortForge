# AER-Core data intake

This folder intentionally contains no production training data.

Place only sanitized, verified, provenance-bound JSONL records here. Do not commit secrets, raw credentials, private tokens, unredacted user content, or heuristic/JEV/GLiDE predictions as gold labels.

The required dataset version is aer-core-dataset-v1. The validator requires VERIFIED status, an eligible label source, evidence/outcome references, no synthetic/fallback examples, and trainingEligible=true.

After validation, the prepare command creates deterministic train/validation/test partitions plus manifest fingerprints.
