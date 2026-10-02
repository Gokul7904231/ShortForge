# ShortForge Sandbox Fabric

Status: V1 provider-neutral execution plane

## Boundary

A sandbox is an isolated execution environment for code/tools and ephemeral workloads. It is distinct from:

- Notebook Fabric: interactive/notebook compute.
- API/GPU Fabric: provider control APIs.
- F06: production worker authority.
- F07: artifact truth and acceptance.

A sandbox may execute code, but it never becomes an F06 worker merely because it is connected or running.

## First provider

PandaStack Hosted is the first real adapter.

The adapter uses PandaStack's documented REST surface:
- POST /v1/sandboxes
- GET /v1/sandboxes/{id}
- POST /v1/sandboxes/{id}/exec
- DELETE /v1/sandboxes/{id}
- GET /v1/me for credential validation.

The adapter intentionally does not infer unsupported features from the provider.

## Provider-neutral contract

SandboxProviderAdapter exposes:
- credential validation
- provisioning
- readiness polling
- command execution
- termination
- reconciliation

Provider credentials are passed per operation and are never placed in runtime metadata, journals, MCP prompts, or F06 worker payloads.

## Safety invariants

1. Production worker eligibility is always false for sandbox providers.
2. No implicit resume/hibernate/wake occurs during command execution.
3. Provider-side idempotency is never assumed where the documented API does not expose it.
4. Provider errors are sanitized so raw response bodies cannot become application exceptions.
5. Sandbox completion is not artifact acceptance. F07 remains authoritative.

## Operational guidance

Use TTLs for disposable work. PandaStack documents sandbox rootfs as ephemeral on kill, while volumes can persist separately. This adapter does not automatically attach persistent volumes; that is a later capability.

## First-party evidence

https://docs.pandastack.ai/docs/getting-started/quickstart/
https://docs.pandastack.ai/docs/sandboxes/run-commands/
https://docs.pandastack.ai/docs/sandboxes/lifecycle/