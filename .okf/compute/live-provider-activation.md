# ShortForge Live Compute Provider Activation

Status: ACTIVATION-READY — real execution remains credential/capacity dependent.

## One-command mental model

manual workflow -> provider credentials -> real RenderFabric -> ComputePool -> ComputeRouter -> selected provider -> CAS -> F07

## Providers

| Provider | Required secrets | Required runtime configuration | Physical proof |
|---|---|---|---|
| AMD | AMD_WORKER_URL, AMD_WORKER_SECRET | Existing AMD worker endpoint/secret | RenderFabric -> AMD -> CAS -> F07 |
| Kaggle | KAGGLE_USERNAME, KAGGLE_KEY | KAGGLE_RENDER_COMMAND | RenderFabric -> Kaggle -> CAS -> F07 |
| Daytona | DAYTONA_API_KEY | DAYTONA_SANDBOX_IMAGE optional; SHORTFORGE_SANDBOX_RENDER_COMMAND; SHORTFORGE_SANDBOX_OUTPUT_PATH | RenderFabric -> Daytona -> CAS -> F07 |
| Modal | MODAL_TOKEN_ID, MODAL_TOKEN_SECRET | MODAL_SANDBOX_IMAGE optional; SHORTFORGE_SANDBOX_RENDER_COMMAND; SHORTFORGE_SANDBOX_OUTPUT_PATH | RenderFabric -> Modal -> CAS -> F07 |
| InstaVM | INSTAVM_API_KEY | INSTAVM_SNAPSHOT_ID optional; SHORTFORGE_SANDBOX_RENDER_COMMAND; SHORTFORGE_SANDBOX_OUTPUT_PATH | RenderFabric -> InstaVM -> CAS -> F07 |
| OpenComputer | OPENCOMPUTER_API_KEY | OPENCOMPUTER_TEMPLATE optional; SHORTFORGE_SANDBOX_RENDER_COMMAND; SHORTFORGE_SANDBOX_OUTPUT_PATH | RenderFabric -> OpenComputer -> CAS -> F07 |
| Blaxel | BL_API_KEY, BL_WORKSPACE | BLAXEL_SANDBOX_IMAGE optional; SHORTFORGE_SANDBOX_RENDER_COMMAND; SHORTFORGE_SANDBOX_OUTPUT_PATH | RenderFabric -> Blaxel -> CAS -> F07 |

## Manual procedure

1. Add only the selected provider's secrets to the GitHub repository/environment.
2. For Kaggle, set a command that creates `/kaggle/working/shortforge-output.mp4`.
3. For Daytona/Modal/OpenComputer/Blaxel, use a sandbox image that contains or can install FFmpeg. For InstaVM, the standard hosted runtime already passed the ShortForge FFmpeg probe; use INSTAVM_SNAPSHOT_ID only for a prebuilt runtime. The workflow command fails closed when FFmpeg is unavailable and package installation is not possible.
4. Open GitHub Actions -> `Live Hosted Sandbox Render Proof`.
5. Select exactly one provider. For OpenComputer and Blaxel, the workflow uses provider-native default templates unless overridden by the corresponding server-side environment configuration.
6. Run the workflow.
7. Require provider completion, a physical artifact, CAS verification, and F07 verification before treating the run as successful production evidence.
8. Save the workflow run and provider telemetry as calibration evidence.

## Safety boundaries

- No self-hosted PandaStack sandbox.
- Sandbox connection does not grant F06 render authority.
- Control-only providers remain outside the render worker pool.
- GLiDE is advisory only.
- F07 and CAS remain physical truth gates.
- Provider completion without a verified physical artifact is not production success.

## Verified Daytona Physical + F07 Evidence — 2026-10-04

Daytona physical qualification is REAL-SMOKE-VERIFIED on GitHub Actions run 37205564715 (main, commit f6fd2b9cfd96d1dafbeb57858ff048174448d412).

Verified chain:
- Daytona credential authentication passed.
- Hosted sandbox provisioned with a unique proof-run name.
- Real FFmpeg render executed at 1080x1920.
- Physical MP4 downloaded to the verifier host.
- CAS SHA-256 and byte-length integrity checks passed.
- F07PhysicalArtifactVerifier independently resolved and decoded the CAS-bound bytes.
- F07ReleaseGuardian.verifyRelease() completed successfully.
- F07 signed receipt verification passed.
- F07 proof JSON was uploaded as GitHub artifact live-hosted-sandbox-f07-evidence (artifact ID 11304537911).
- Sandbox termination is executed in the test cleanup path.

This evidence qualifies the Daytona physical + CAS + F07 boundary. It does not promote Daytona into F06 production-worker eligibility.

The one-shot [live-daytona-f07-proof] push trigger used solely to obtain this real proof is removed after qualification.

## Verified HF ZeroGPU Operator Proof — 2026-10-04

The private Hugging Face Space `gokul-labs/shortforge-zerogpu-render` has a physical operator proof independent of ShortForge.

Verified outside the repository:
- ZeroGPU allocated `NVIDIA RTX PRO 6000 Blackwell Server Edition MIG 2g.48gb`.
- Gradio `/render` accepted the authenticated request.
- The hosted function generated a 1080x1920 MP4.
- The authenticated file route returned HTTP 200.
- Downloaded artifact length: 277495 bytes.
- Independent SHA-256: `788664813bde46040ab1c15d3f83d745074575707061ab88c8d38deffae6b34d`.

Repository-side qualification is intentionally separate. Issue #160 tracks the remaining ShortForge adapter -> physical artifact -> CAS -> F07 proof. The provider remains outside F06 production-worker eligibility until that live repository proof passes.


## Verified HF ZeroGPU ShortForge Physical + CAS + F07 Evidence — 2026-10-04

ShortForge repository-side qualification completed successfully on GitHub Actions run **37215052417** (workflow run #7, PR #161, head commit `9f55bc5c8d1186f6649d818c4cd036ba87cd1c5d`).

Verified chain:
- authenticated private Hugging Face Space `gokul-labs/shortforge-zerogpu-render`;
- Gradio `/render` queue submission and completion;
- ZeroGPU hosted execution on NVIDIA RTX PRO 6000 Blackwell substrate;
- physical MP4 downloaded by `HuggingFaceZeroGPUAdapter`;
- ShortForge recomputed SHA-256 `788664813bde46040ab1c15d3f83d745074575707061ab88c8d38deffae6b34d` and byte length **277495**;
- independent media probe: 1080x1920, H.264/AAC, 30fps, 1.000s video, 0.981s audio, 2 streams, yuv420p, decode smoke passed;
- CAS ref `cas://788664813bde46040ab1c15d3f83d745074575707061ab88c8d38deffae6b34d` with integrity valid;
- F07PhysicalArtifactVerifier accepted the CAS-bound bytes;
- F07ReleaseGuardian produced a signed receipt and signature verification passed;
- receipt ID `rcpt_live_hf_zerogpu_muu0d83o_2026-10-04T160122706Z`;
- GitHub evidence artifact `hf-zerogpu-f07-evidence`, artifact ID **11308620102**, upload successful.

This is a **REAL-SMOKE-VERIFIED** hosted-function proof. It does **not** promote HF ZeroGPU into the F06 production worker fleet; `productionWorkerEligible=false` remains mandatory.
## Verified InstaVM Provider Physical Artifact Evidence — 2026-10-06

A direct InstaVM qualification run was completed outside GitHub Actions using the official Python SDK/CLI on a verified account.

Verified chain:
- authenticated InstaVM API access;
- real hosted Firecracker microVM provisioned;
- real Bash execution and FFmpeg availability;
- 1080x1920 H.264 MP4 render with 48 kHz AAC audio;
- 1.000000s physical artifact with byte length **21341**;
- remote SHA-256 **3c10770e8509a933cfddef5372e2ab8bcd93a966b5415fa8f65e62046aa12174**;
- artifact downloaded from the same live session;
- local byte length **21341** and identical SHA-256;
- final operator proof marker: **INSTA_VM_PHYSICAL_ARTIFACT_PROOF=PASS**.
This establishes provider execution and physical artifact-transfer capability. Repository-side CAS + F07 qualification remains the final acceptance step. productionWorkerEligible=false remains mandatory.
## Verified InstaVM Repository Physical + CAS + F07 Evidence — 2026-10-09
Repository-side credential-backed qualification passed on GitHub Actions workflow run **37893345664** (temporary qualification PR #229, run #14, qualification branch head `a7a7dc72505b6723be8527a7ce2d1daadd063b52`). The qualification branch and production implementation PR #226 contain the same InstaVM adapter implementation; the temporary workflow itself is not part of the production PR.
- InstaVM `POST /v1/vms?wait=true` returned an active VM and real canonical session ID (HTTP 200);
- raw session-bound `POST /execute` succeeded (HTTP 200, exit code 0); diagnostic session was terminated successfully (HTTP 200);
- ShortForge provisioned a fresh InstaVM runtime and rendered a physical MP4 with FFmpeg;
- artifact downloaded from the provider and independently verified, including MP4 container, decode smoke, dimensions **1080x1920**, H.264 video, AAC audio, 30fps, 1.000s video/audio, yuv420p, 48 kHz mono;
- artifact byte length **5901** and SHA-256 **46e447aec702d345f3a6f239fced7b665606dde99c9d3e205596713f537dd623**;
- CAS integrity verified at `cas://46e447aec702d345f3a6f239fced7b665606dde99c9d3e205596713f537dd623`;
- independent F07 outcome **READY**, `publishAllowed=true`, and `receiptSignatureVerified=true`;
- receipt ID `rcpt_live_instavm_mv0l1snw_2026-10-09T062658452Z`; receipt persisted to the workflow's CAS storage;
- evidence JSON uploaded as GitHub Actions artifact **instavm-f07-evidence**, artifact ID **11599775673**.
This completes repository-side physical artifact + CAS + F07 qualification for InstaVM. It does **not** grant F06 production-worker authority; `productionWorkerEligible=false` remains mandatory. The temporary qualification PR #229 is evidence-only and must not be merged.
## Provider qualification status — 2026-10-06
OpenComputer and Blaxel adapter/connection integration is COMPLETE at the Sandbox Fabric contract level. Live physical + CAS + F07 evidence is still credential-run dependent and must be recorded from the GitHub Actions live workflow before either provider can be considered physically qualified.
This preserves the rule that implementation status and physical qualification status are separate facts.