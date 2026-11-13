# Ascalon Dataset Lane Admission

> Status: IMPLEMENTED ON REVIEW BRANCH; CI AND MERGE ADMISSION PENDING
> Scope: Ascalon Overseer dataset preparation
> Authority: Existing Ascalon training contract and dataset policy; this document does not authorize model-weight training.

## 1. Why two lanes exist

Synthetic scenarios are valuable for controlled curriculum and regression tests. They are not observations of ShortForge production behavior. They must not share an operational training export or be counted as verified production examples.

The exporter therefore exposes two explicit entry points:

- `exportDataset(trajectories, evidenceManifest)` for verified operational records only.
- `exportCurriculumDataset(trajectories)` for synthetic/simulation curriculum only.

A record rejected by one lane must not be moved into the other lane by changing only its label. Its environment and provenance must match the target lane.

## 2. Verified operational lane

A record is considered for the operational lane only when all of the following hold:

1. The general trajectory validator passes.
2. `provenance.trainingEligible === true`.
3. Environment is explicitly `REAL` or `PRODUCTION`.
4. `simulation` and `synthetic` are not true.
5. Label source is one of `VERIFIED_OUTCOME`, `HUMAN_EXPERT`, or `DETERMINISTIC_TEACHER`.
6. A family key exists (`missionFamily`, `caseId`, or `missionId`).
7. The label's external attestation is present in the supplied evidence manifest.

Attestation rules:

- `VERIFIED_OUTCOME`: the outcome must be verified and its receipt ID must be present in `verifiedOutcomeEvidenceIds`.
- `HUMAN_EXPERT`: `provenance.humanReviewRef` must be present in `humanReviewRefs`.
- `DETERMINISTIC_TEACHER`: `provenance.teacherAttestationRef` must be present in `deterministicTeacherAttestationRefs`.
- Any `SUCCESS` outcome must carry an independently attested verification receipt, regardless of label source.

The manifest is a trusted boundary object. It must be created by an upstream verifier that actually resolves the receipt/review/teacher reference against the authoritative evidence store. Constructing a set from IDs copied out of a trajectory is not independent verification.

## 3. Synthetic curriculum lane

Synthetic records must be explicitly simulation/synthetic and use an approved curriculum label source:

- `SIMULATION`
- `SIMULATION_PSEUDO`
- `DETERMINISTIC_TEACHER`

A synthetic record cannot claim `VERIFIED_OUTCOME`. Curriculum eligibility means eligible for the isolated curriculum corpus only; it does not mean operational ground truth.

The generator writes these records under `training/ascalon/data/curriculum/`. It does not populate the operational training paths.

## 4. Family-safe partitioning

Records are grouped by the first available stable key:

1. `episode.missionFamily`
2. `episode.caseId`
3. `episode.missionId`

A SHA-256 hash of the split-policy version and family key deterministically assigns the whole family to target bands:

- 0–69.99%: train
- 70–84.99%: validation
- 85–99.99%: test

The 70/15/15 split is a target distribution, not an exact promise for small or skewed corpora. The manifest records actual family and row counts. Re-running with the same family keys and policy version gives the same assignments.

## 5. Manifests and quality reports

The synthetic curriculum generator records:

- source commit (or an explicit unpinned marker for a local run);
- dataset and shard SHA-256 digests;
- generator/validator identifiers;
- trajectory IDs;
- family-based split policy and actual counts;
- validator-derived pass/rejection metrics;
- provenance breakdown.

Replay is reported as `NOT_EVALUATED` until the replay path independently re-executes recorded transitions against a controlled state and checks reconstructed state/evidence. Echoing the recorded decision is not replay proof.

## 6. Current limits and next admission gates

This branch establishes lane isolation and the exporter boundary. It does not yet supply:

- the trusted production evidence-manifest resolver;
- a populated, independently verified production trajectory corpus;
- an independently executing replay engine;
- a pinned Ascalon base checkpoint and reproducible LoRA/QLoRA configuration;
- SFT, DPO, or RLVR run evidence.

Therefore no model-weight training is authorized by this implementation. Synthetic curriculum generation can be tested separately, while operational training admission remains empty until the external evidence resolver and real corpus are available.
