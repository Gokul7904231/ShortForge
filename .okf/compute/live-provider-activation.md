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