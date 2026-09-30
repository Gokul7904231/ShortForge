# True Eight-Floor Production Trajectory

Status: VERIFIED
Date: 2026-09-29
Proof workflow: True Eight-Floor Production Trajectory
GitHub Actions run: #19 (run ID `36533002552`)
Proof artifact: `artifacts/eight-floor-production-trajectory-proof.json`
Proof artifact ID: `11017071985`
Proof artifact digest: `sha256:f564e1b298c438fb549f2f737768442cdc36c008bf085b1ecb5986ec97cc9f3f`

## Objective

Execute one real ShortForge mission through the canonical production topology:

F00 → F01 → F02 → (F03 || F04) → F05 → F06 → F07

using one mission identity and one Overseer run identity.

The trajectory is admitted to Ascalon learning only after independent evidence proves the complete path.

## Verified Run

Mission ID: `mission_8e903d1819`
Run ID: `run_4afca830c1f5`
Trajectory ID: `traj_0e685f7f90d7c04b0003`
Trajectory fingerprint: `0e685f7f90d7c04b000342497b04f364fb695f4470517eecad076ae658a0b4c4`

Verified floor count: 8 / 8
Total iterations: 8
Recovered iterations: 0
Final outcome: SUCCESS
Training eligible: true

## Floor Evidence

| Floor | Execution ID | Proof source | Verified |
|---|---|---|---|
| F00 | `exec_task_f00_analyst_1790664602820` | RUNTIME | ✅ |
| F01 | `exec_task_f01_strategy_1790664602849` | RUNTIME | ✅ |
| F02 | `exec_task_f02_scripting_1790664602881` | RUNTIME | ✅ |
| F03 | `exec_task_f03_asset_realization_1790664602915` | RUNTIME | ✅ |
| F04 | `exec_task_f04_media_synthesis_1790664602915` | RUNTIME | ✅ |
| F05 | `exec_task_f05_timeline_composition_1790664603017` | RUNTIME | ✅ |
| F06 | `exec_task_f06_rendering_1790664603033` | PHYSICAL_VERIFIER | ✅ |
| F07 | `exec_task_f07_compliance_1790664618599` | PHYSICAL_VERIFIER | ✅ |

All eight floors share the same mission and run identity.

## Physical F06 Artifact

Artifact SHA-256:

`41eccb729c584f956db5edc518fcd52efe966c034737c9072f9b365f3962a3e6`

Byte length: 574,851
Dimensions: 1080 × 1920
Measured duration: 25 seconds
Video codec: H.264
Audio codec: AAC
Pixel format: yuv420p
FPS: 30
Audio sample rate: 44.1 kHz
Audio channels: 2

F06 evidence also contains the RenderFabric execution receipt and provider admission receipt.

## F04 Physical Audio

F04 produced a physical WAV artifact and emitted:

- explicit `qualityClass`
- selected provider
- byte length
- SHA-256
- fallback classification
- `WAV_AUDIO` produced artifact
- runtime closure receipt

The successful trajectory used the deterministic degraded voice path allowed by the proof workflow; it was not represented as a primary neural provider success.

## F05 Boundary

F05 consumed the F04 audio fingerprint and produced the canonical composition/render intent used by F06.

## F07 Independent Verification

F07 independently verified the F06 artifact.

Measured F07 facts:

- fileExists: true
- byteLength: 574,851
- ftyp box present: true
- decode smoke test: passed
- dimensions: 1080 × 1920
- video duration: 25 s
- audio duration: 25.02322 s
- sync drift: 23.22 ms
- video codec: H.264
- audio codec: AAC
- stream count: 2

F07 proof references the same F06 artifact SHA-256, establishing physical artifact continuity rather than trusting an upstream status string.

## Ascalon Learning Signal

Signal ID: `asl_0e685f7f90d7c04b`
Trajectory ID: `traj_0e685f7f90d7c04b0003`
Mission ID: `mission_8e903d1819`
Run ID: `run_4afca830c1f5`
Outcome: SUCCESS
Predicted success: true
Validator passed: true
Verification status: VERIFIED
Training eligible: true

The signal was emitted exactly once for the verified trajectory.

## Acceptance Contract

A trajectory is VERIFIED only when all of the following are simultaneously true:

1. One missionId is preserved from F00 through F07. **PASS**
2. One runId is preserved from F00 through F07. **PASS**
3. All eight canonical floors emit authoritative TASK_COMPLETED evidence. **PASS**
4. Every floor has qualifying closure evidence and a successful verification predicate. **PASS**
5. F03 consumes the canonical F02 handoff. **PASS**
6. F04 produces a physical audio artifact with explicit quality classification. **PASS**
7. F05 produces the canonical composition intent. **PASS**
8. F06 executes through RenderFabric/ComputeGateway and produces a physically present MP4. **PASS**
9. F06 physical evidence includes non-zero bytes, SHA-256, duration, width and height. **PASS**
10. F07 independently probes the physical artifact and records PHYSICAL_VERIFIER evidence. **PASS**
11. F07 verifies the F06 artifact fingerprint. **PASS**
12. ProductionTrajectoryEvaluator reports VERIFIED, 8/8 floors and SUCCESS. **PASS**
13. No authority violation or handoff-only proof is present. **PASS**
14. AscalonLearningSignal is emitted exactly once for the verified trajectory. **PASS**
15. Main remains unchanged until the proof branch is independently validated. **PASS**

## Architecture Invariants

Intelligence may propose.
Authority may authorize.
Runtime may execute.
Evidence must prove.

The proof path uses canonical floor execution and the real local RenderFabric. The research WAN dependency is replaced only with a deterministic local evidence fixture. F03 persistence is explicitly backed by the disk adapter in this CI proof lane; production defaults remain Firestore when the explicit local mode is absent.

The proof does not claim a live customer deployment or a multi-provider cloud production render. It proves the canonical production execution path and its evidence/verification contract end-to-end in a controlled CI environment.

## Failure-Driven Hardening

The proof required real defects to be corrected before verification:

- Initial run failed because advisory classification expected an unconfigured model.
- The next attempt exposed an F03 Firestore dependency in a credential-free proof lane.
- The following attempts showed the trajectory could finish with only 7/8 observations.
- Investigation found that the canonical registry names F07 executor type `FLOOR_COMPLIANCE`, while Overseer exposed `FLOOR_VERIFICATION`; the DAG silently fell back to generic `TOOL`, allowing F07 execution to appear successful without an authoritative completion event.
- The executor key was aligned to the canonical registry.
- The trajectory collector was strengthened with event-journal reconciliation.
- F03 completion evidence was corrected to preserve runId.
- The proof test was changed to fail fast on a terminal PARTIAL/UNVERIFIED evaluation.

## Completion Record

Run #19 is the first passing true single-mission eight-floor production-path proof.

The verified trajectory is:

`mission_8e903d1819`
→ `run_4afca830c1f5`
→ F00
→ F01
→ F02
→ (F03 || F04)
→ F05
→ F06 physical MP4
→ F07 independent verification
→ `traj_0e685f7f90d7c04b0003`
→ `asl_0e685f7f90d7c04b`

Do not mark a future trajectory VERIFIED merely because it resembles this run. Each new trajectory must independently satisfy the acceptance contract and produce its own evidence artifact.
