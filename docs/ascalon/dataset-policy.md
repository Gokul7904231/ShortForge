# Project Ascalon: Dataset Ingestion & Partitioning Policy

## 1. Scope & Objective

This policy governs the curation, sanitization, filtering, and partitioning of datasets exported from ShortForge / FactoryOS for model training, reinforcement learning, and behavioral cloning.

---

## 2. Ingestion & Training Eligibility Gates

Only trajectories satisfying all five Ascalon Ingestion Gates may be marked `trainingEligible: true`:

| Gate | Verification Check | Failure Action |
| :--- | :--- | :--- |
| **Gate 1: Secret Sanitization** | Regex scan for 9 credential patterns (Google, OpenAI, Groq, NVIDIA, GitHub, JWT, Bearer tokens, RSA keys). | **Drop record**; raise security alert. |
| **Gate 2: Schema Validation** | Conformance to `trajectory_schema_v1.json` with all 11 mandatory top-level sections. | **Drop record**; log schema mismatch. |
| **Gate 3: Contamination Check** | Disallow `environment: SIMULATION` or `synthetic: true` claiming `labelSource: VERIFIED_OUTCOME`. | **Drop record**; isolate telemetry. |
| **Gate 4: Claim <= Evidence** | Reject any record with `status: SUCCESS` where `verified` is false or evidence ID is absent. | **Drop record**; flag false telemetry. |
| **Gate 5: Tool Whitelist** | Validate tool against the authoritative capability ontology (`capabilities.json`). | **Drop record**; log hallucinated tool. |

---

## 3. Mission-Family Partitioning Policy

To prevent evaluation leakage, datasets are never partitioned using random row-level sampling.

### 3.1 Split Ratio
- **Training Set (`train.jsonl`)**: ~70% of mission families.
- **Validation Set (`validation.jsonl`)**: ~15% of mission families.
- **Test Set (`test.jsonl`)**: ~15% of mission families.

### 3.2 Partitioning Invariant
All episodes originating from a single `missionFamily` (e.g., `FAMILY_NARRATIVE_SHORT`) must reside entirely within either the Train, Validation, or Test split. **Cross-split family overlap is strictly forbidden**, guaranteeing that validation and test sets evaluate generalization to unseen narrative structures and production workflows.

---

## 4. Retention & Provenance Archival

- All exported datasets are archived alongside their cryptographic SHA-256 manifests under `training/ascalon/reports/`.
- Training runs must record the exact dataset commit hash and provenance manifest digest in their metadata configs.
