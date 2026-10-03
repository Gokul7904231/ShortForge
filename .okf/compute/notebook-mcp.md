# ShortForge Notebook MCP Diagnostics

Status: provider-specific MCPs remain bounded integration/diagnostic surfaces; physical rendering truth belongs to the canonical adapters and F07.

## Dedicated MCPs

Three provider-specific notebook render-provider MCP servers are repository-owned:

- shortforge-kaggle-notebook
- shortforge-colab-notebook
- shortforge-lightning-notebook

They are bounded connection/capability diagnostics. They do not replace the canonical internal notebook adapters and do not receive F06 worker authority.

## Tool surface

Each server exposes provider connection/capability tools. No tool accepts credentials as arguments. No MCP tool exposes arbitrary remote command execution.

## Live proof

The provider verification workflow owns side-effecting render tests. The MCP layer proves protocol/tool connectivity and provider authentication; it does not become the source of F07 artifact truth.

### Kaggle

A live run submits a real notebook kernel, executes a deterministic one-second MP4 FFmpeg probe, downloads the output, verifies SHA-256 and byte length locally, and deletes the kernel.

### Kaggle verification record

GitHub Actions notebook-fabric run #89 (37099200857) passed the real Kaggle physical-artifact probe and dedicated Kaggle MCP live smoke. The artifact proof was PHYSICAL_ARTIFACT_VERIFIED with local SHA-256 and byte-length recomputation. Mainline closeout is merged in PR #99.

### Google Colab

The dedicated MCP exposes bounded Colab connection/capability diagnostics. The actual rendering path is now implemented in ColabNotebookAdapter using the allowlisted Colab Runtime API plus the managed runtime's standard Jupyter interface. Once Google grants API access to the submitted project, the live proof will create an eligible T4 runtime, execute a bounded FFmpeg render, retrieve the physical MP4, verify SHA-256/byte length and the MP4 ftyp signature, then terminate the runtime.

### Lightning AI

A live run authenticates the Lightning API, starts a Studio by default on CPU, executes a deterministic Python marker through the Lightning SDK, checks the exit code/output, and stops the Studio. The latest live run succeeded at CODE_EXECUTION_VERIFIED. Physical MP4 transfer into ShortForge CAS is still the remaining rendering-proof step.

## Credentials

GitHub Actions currently uses repository secrets for provider-specific live checks:

KAGGLE_USERNAME
KAGGLE_KEY
COLAB_ACCESS_TOKEN
LIGHTNING_USER_ID
LIGHTNING_API_KEY

For local Colab development, the adapter can also use Google Application Default Credentials (ADC) through googleapis; runtime proxy tokens returned by Colab are short-lived and are kept in process memory only.

## Authority

MCP success is a tool result, not production truth. Worker admission, leases/fencing, CAS authority, F07 acceptance, and ReleaseAuthorization remain outside these servers.

> Live-proof note: Kaggle's physical-artifact smoke defaults to CPU for deterministic, low-queue verification; GPU execution remains selectable with KAGGLE_LIVE_GPU=1.
