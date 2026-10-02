# ShortForge Live Compute Provider Activation

Status: ACTIVATION-READY — real execution remains credential/capacity dependent.

## One-command mental model

`manual workflow -> provider credentials -> real RenderFabric -> ComputePool -> ComputeRouter -> selected provider -> CAS -> F07`

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
3. For Daytona/Modal, use a sandbox image that contains or can install FFmpeg. The workflow command will fail closed when FFmpeg is unavailable and package installation is not possible.
4. Open GitHub Actions -> `Live Multi-Provider Render`.
5. Select exactly one provider.
6. Run the workflow.
7. Require the workflow to show: provider receipt COMPLETED, physical artifact present, CAS verification PASS, and F07 verification PASS.
8. Save the workflow run link and the emitted provider telemetry as the provider's first calibration evidence.

## GLiDE promotion

Do not switch GLiDE to CANARY from this workflow alone. First collect repeated successful observations for the same workload class, including startup, execution, transfer, failure, and F07 verification telemetry.

Use the configured `COMPUTE_TELEMETRY_MIN_SAMPLES` floor before allowing measured timing to override declared provider estimates.

## Failover proof

Run the same render with the primary provider unavailable. Expected behavior:

`hard eligibility -> primary rejected -> next eligible worker -> render -> CAS -> F07`

Failure telemetry must retain the rejected provider and reason.

## Safety boundaries

- No self-hosted PandaStack.
- Sandbox connection does not grant F06 render authority.
- Control-only providers remain outside the render worker pool.
- GLiDE is advisory only.
- F07 and CAS remain physical truth gates.
- Provider completion without a verified physical artifact is not success.