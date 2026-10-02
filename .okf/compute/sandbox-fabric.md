# ShortForge Sandbox Fabric

Status: hosted-only V1 execution plane

## Boundary

A sandbox is an isolated execution environment for code/tools and short-lived workloads. It is distinct from:

- Notebook Fabric: interactive notebook compute.
- API/GPU Fabric: provider control and provisioning.
- F06: production worker authority.
- F07: artifact truth and acceptance.

A sandbox never becomes an F06 worker merely because it is connected or running.

## Hosted providers

The V1 sandbox registry contains only hosted providers:

- Daytona Hosted
- Modal Hosted

The removed PandaStack adapter is not part of the sandbox plane.

Daytona's current TypeScript SDK supports hosted Sandbox creation, command execution, filesystem upload/download, lifecycle control, and reconciliation. Modal's current JavaScript SDK supports hosted Sandbox creation, command execution, filesystem access, lifecycle control, and re-attachment by sandbox ID.

## Provider-neutral contract

SandboxProviderAdapter exposes:

- credential validation
- provisioning
- readiness
- command execution
- optional file upload/download
- termination
- reconciliation

Credentials are passed per operation and are never placed in runtime metadata, routing telemetry, journals, MCP prompts, or F06 worker payloads.

## Safety invariants

1. Sandbox productionWorkerEligible is always false.
2. Sandbox registration does not grant production render authority.
3. ShortForge keeps provider lifecycle state separate from execution truth.
4. Provider-side idempotency is never assumed when it is not guaranteed.
5. Provider errors are normalized before they enter application exceptions.
6. Sandbox completion is not artifact acceptance. F07 remains authoritative.
7. Hosted sandbox implementations fail closed when their provider SDK or credentials are unavailable.

## Activation

Daytona:
- DAYTONA_API_KEY
- optional DAYTONA_API_URL
- optional DAYTONA_TARGET
- optional DAYTONA_SANDBOX_IMAGE

Modal:
- MODAL_TOKEN_ID
- MODAL_TOKEN_SECRET
- optional MODAL_SANDBOX_APP_NAME
- optional MODAL_SANDBOX_IMAGE

## Evidence

Daytona TypeScript SDK reference: https://www.daytona.io/docs/en/typescript-sdk/
Daytona process/code execution: https://www.daytona.io/docs/en/process-code-execution/
Daytona filesystem: https://www.daytona.io/docs/en/typescript-sdk/file-system/
Modal JavaScript SDK: https://modal.com/docs/sdk/js/latest/intro
Modal Sandbox: https://modal.com/docs/sdk/js/latest/Sandbox