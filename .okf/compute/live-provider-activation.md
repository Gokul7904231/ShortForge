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

## Manual procedure

1. Add only the selected provider's secrets to the GitHub repository/environment.
2. For Kaggle, set a command that creates `/kaggle/working/shortforge-output.mp4`.
3. For Daytona/Modal, use a sandbox image that contains or can install FFmpeg. The workflow command fails closed when FFmpeg is unavailable and package installation is not possible.
4. Open GitHub Actions -> `Live Multi-Provider Render`.
5. Select exactly one provider.
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
