# Repo Mapping — InvokeAI

Repository: https://github.com/invoke-ai/InvokeAI

Observed pattern:
- A saved workflow is not itself an executable queue submission.
- Execution requires a separate executable graph and queue operation.
- The specification/execution boundary is explicit.

ShortForge mapping:
- AssetPlanIR is a non-executable specification artifact.
- Downstream F05/provider adapters compile it into execution-specific representations.
- F03 does not enqueue provider graphs or own provider credentials.

Not adopted:
- InvokeAI runtime, queue, graph nodes, or provider integrations.

Status: ARCHITECTURE_REFERENCE
