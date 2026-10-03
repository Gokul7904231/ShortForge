# ShortForge Notebook MCP Diagnostics

Status: finalized — live Kaggle provider and MCP proof passed 2026-10-03.

## Dedicated MCPs

Three provider-specific notebook MCP servers are now repository-owned:

- shortforge-kaggle-notebook
- shortforge-colab-notebook
- shortforge-lightning-notebook

They are bounded connection/capability diagnostics. They do not replace the canonical internal notebook adapters and do not receive F06 worker authority.

## Tool surface

Each server exposes provider-specific connection/capability diagnostics. No tool accepts credentials as arguments.

Kaggle additionally exposes:
- `kaggle_official_mcp_check`: probes Kaggle's official remote MCP endpoint.
- `kaggle_official_mcp_tools`: discovers the live remote MCP tool catalog without executing a tool.

Lightning additionally exposes:
- `lightning_litserve_mcp_check`: probes a configured LitServe Streamable HTTP MCP endpoint.
- `lightning_litserve_mcp_tools`: discovers the configured LitServe MCP tool catalog without executing a tool.

These native-MCP tools are diagnostics/interop surfaces, not F06 worker authority.

## Live proof

Provider smoke from apps/web:

NOTEBOOK_LIVE=1 NOTEBOOK_PROVIDER=KAGGLE npm run factoryos:verify:notebooks

MCP protocol plus provider smoke from repository root:

NOTEBOOK_MCP_PROVIDER=KAGGLE node apps/web/scripts/verify-notebook-mcps.mjs

The live workflow .github/workflows/notebook-fabric.yml runs both proof layers.

### Kaggle

A live run submits a real notebook kernel, executes a deterministic one-second MP4 FFmpeg probe, downloads the output, verifies SHA-256 and byte length locally, and deletes the kernel.

### Kaggle verification record

GitHub Actions notebook-fabric run #89 (`37099200857`) passed the real Kaggle physical-artifact probe and dedicated Kaggle MCP live smoke. The artifact proof was `PHYSICAL_ARTIFACT_VERIFIED`, with local SHA-256 and byte-length recomputation. Mainline closeout is merged in PR #99.

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


## Provider-native MCP research — 2026-10-03

### Kaggle

Kaggle now publishes an official remote MCP server at `https://www.kaggle.com/mcp`. Its current documentation supports OAuth 2.0 and bearer token authentication; token authentication uses a Kaggle token beginning with `KGAT`. The notebook tool surface includes session cancellation/creation, notebook metadata, session status, file listing, output listing/download, notebook saving, and notebook search. fileciteturn617file0L5-L8 fileciteturn617file0L80-L98 fileciteturn617file0L171-L217

ShortForge now treats that official MCP endpoint as a provider-native interoperability surface rather than reimplementing Kaggle's entire remote MCP tool catalog. The dedicated MCP can probe the official endpoint and discover its tools, while the canonical Kaggle adapter remains responsible for the verified kernel lifecycle/physical-artifact path.

### Lightning / LitServe

Current LitServe source implements MCP as Streamable HTTP mounted at `/mcp/`, with a low-level MCP server and a stateless Streamable HTTP session manager. A LitServe `MCP` object converts a `LitAPI` endpoint into an MCP tool using its name, description, and input schema. citeturn779088search2turn779088search3

LitServe's current documentation/repository positions MCP as a supported server capability alongside batching, streaming, multi-GPU serving, and deployment. citeturn779088search0

ShortForge now adds a native LitServe MCP diagnostics path. It expects an explicit `LIGHTNING_LITSERVE_MCP_URL` and optionally a bearer token or `X-API-Key`. The probe normalizes `/mcp` to `/mcp/`, performs the MCP initialize/tools-list handshake, captures any session identifier, follows redirects, and never executes arbitrary remote tools.

### Security/authority

Provider-native MCP discovery is deliberately separated from provider control and F06 worker admission. Tool discovery does not imply execution permission, persistence, artifact truth, lease ownership, CAS authority, or F07 release authorization.
