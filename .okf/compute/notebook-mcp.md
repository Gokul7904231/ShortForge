# ShortForge Notebook MCP Diagnostics

Status: implementation wave — 2026-10-02.

## Dedicated MCPs

Three provider-specific notebook MCP servers are now repository-owned:

- shortforge-kaggle-notebook
- shortforge-colab-notebook
- shortforge-lightning-notebook

They are bounded connection/capability diagnostics. They do not replace the canonical internal notebook adapters and do not receive F06 worker authority.

## Tool surface

Each server exposes only two tools:

- provider_connection_check: performs the provider's real credential/reachability check using secrets already present in the server process environment.
- provider_capabilities: returns canonical provider metadata.

No tool accepts credentials as arguments. No tool accepts arbitrary remote commands.

## Live proof

Provider smoke from apps/web:

NOTEBOOK_LIVE=1 NOTEBOOK_PROVIDER=KAGGLE npm run factoryos:verify:notebooks

MCP protocol plus provider smoke from repository root:

NOTEBOOK_MCP_PROVIDER=KAGGLE node apps/web/scripts/verify-notebook-mcps.mjs

The live workflow .github/workflows/notebook-fabric.yml runs both proof layers.

### Kaggle

A live run submits a real notebook kernel, executes a deterministic one-second MP4 FFmpeg probe, downloads the output, verifies SHA-256 and byte length locally, and deletes the kernel.

### Google Colab

A live run verifies the Colab runtime-spec endpoint. Setting COLAB_LIVE_PROVISION=1 additionally creates and deletes one runtime. Generic code execution remains unsupported by the adapter, so the proof level is control-plane rather than worker execution.

### Lightning AI

A live run starts a CPU Studio by default, executes a deterministic Python marker through the Lightning SDK, checks the returned exit code/output, and stops the Studio. A different machine can be supplied explicitly through the workflow input.

## Credentials

GitHub Actions uses these repository secrets:

KAGGLE_USERNAME
KAGGLE_KEY
COLAB_ACCESS_TOKEN
LIGHTNING_USER_ID
LIGHTNING_API_KEY

Secrets are passed only through the environment. They are not committed and are not accepted as MCP tool arguments.

## Authority

MCP success is a tool result, not production truth. Worker admission, leases/fencing, CAS authority, F07 acceptance, and ReleaseAuthorization remain outside these servers.

> Live-proof note: Kaggle's physical-artifact smoke defaults to CPU for deterministic, low-queue verification; GPU execution remains selectable with `KAGGLE_LIVE_GPU=1`.
