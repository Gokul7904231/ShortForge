# ShortForge / FactoryOS — MCP Architecture

> **Status:** LOCKED DIRECTION / SELECTED MCP FABRIC IMPLEMENTED
> **Purpose:** Define the role of Model Context Protocol (MCP) integrations without creating a second authority plane.

## 1. MCP role

MCP is an integration surface between an MCP host and external tools/data systems.

For ShortForge:

- MCPs may provide information, bounded operator actions, and developer tooling.
- MCPs are not sovereign controllers.
- MCPs do not replace Overseer, Guardian, AgentRuntime, CAS, F07, or ReleaseAuthorization.
- A successful MCP call is not evidence that a production side effect is authorized or complete.

Canonical production flow remains:

`Overseer -> Guardian -> AgentRuntime -> Worker -> Artifact -> F07 -> ReleaseAuthorization -> DeliveryAdapter`

MCP access sits outside this authority chain unless a future decision explicitly adds a capability-gated MCP adapter.

## 2. Essential MCP set

The production MCP set is intentionally small:

| MCP | Role | Status | Boundary |
|---|---|---|---|
| GitHub | Engineering source, code review, Devourer research | EXISTING | Development / governance |
| Google Drive | Bounded artifact/knowledge import-export | EXISTING | Storage integration |
| Blender MCP | 3D asset/scene/render operations | EXISTING | Governed visual execution |
| Playwright MCP | F00/F01 browser research and inspection | SELECTED / IMPLEMENTED | Scoped research sensor |
| ComfyUI MCP | F03-F06 generative visual workflows | SELECTED / IMPLEMENTED | Isolated provider |
| Qdrant MCP | Derived Memory Fabric ANN retrieval | SELECTED / IMPLEMENTED | Projection/index only |

FFmpeg MCP, Filesystem MCP, Obsidian MCP, Remotion MCP and Docker MCP Gateway are deliberately not selected in this wave because their useful responsibilities are already covered by canonical ShortForge subsystems or broader infrastructure boundaries.

### Selected MCP execution boundary

Ascalon -> FGC/Action Graph -> Agent Execution Router -> CapabilityRegistry -> SelectedMcpGateway -> MCP -> result/evidence -> F07

The model never gets unrestricted MCP tool selection.

## 3. Google Drive MCP

Repository path:

`tools/mcp/google-drive/`

Implemented tools:

- `drive_health`
- `drive_list`
- `drive_search`
- `drive_get_metadata`
- `drive_create_folder`
- `drive_upload`
- `drive_download`
- `drive_export`

Security defaults:

- readonly Drive scope
- upload disabled unless readwrite scope is explicitly configured
- local upload paths are allowlisted
- downloads are constrained to a dedicated root
- no Drive ACL mutation
- no public-link generation
- no delete/trash operation
- no publication/release authorization

The MCP is deliberately separate from the existing Google Drive production provider and `DriveDeliveryAdapter`.

## 4. MCP versus provider adapters

Use an MCP when the model or operator needs a bounded external-tool interface.

Use an internal provider adapter when the FactoryOS production state machine needs a side effect.

Examples:

- listing Drive files for an operator -> Google Drive MCP
- exporting a research document -> Google Drive MCP
- final verified video delivery -> `DriveDeliveryAdapter`
- channel publishing -> publishing provider + `ReleaseAuthorization`
- render execution -> `RenderFabric`
- artifact identity -> CAS

Do not route production side effects through a generic MCP merely because the external provider exposes an API.

## 4.1 Agent Execution Fabric boundary

MCP is never exposed merely because an agent has a capability. AEF step contracts determine the exact tool IDs exposed to a step, then verify the required capabilities and idempotency contract before delegating to ToolExecutor.

The execution chain is:

`Ascalon/Cognitive proposal -> Floor Council/FGC -> AgentExecutionRouter -> ScopedToolExecutor -> ToolExecutor -> MCP adapter (when needed)`

An MCP response is a tool result. It is not authorization, artifact verification, or release truth.

## 5. MCP permission model

MCP permissions are separate from floor-worker permissions.

Suggested future capability names:

- `CAP_MCP_DRIVE_READ`
- `CAP_MCP_DRIVE_WRITE`
- `CAP_MCP_BROWSER_RESEARCH`
- `CAP_MCP_GITHUB_READ`
- `CAP_MCP_GITHUB_WRITE`

They are not default F00-F07 worker grants.

A worker may use an MCP only through an explicitly authorized skill and capability grant. The MCP server itself must enforce its own local safety boundary.

## 6. Devourer use

Devourer may use MCPs as research and engineering sensors:

`MCP -> evidence -> compare with .okf -> prototype -> benchmark -> verify -> propose`

MCP output is evidence/input, not architecture authority.

External content must not silently override executable implementation, tests, canonical contracts, or the current .okf sweep.

## 7. Forbidden MCP shortcuts

Do not use MCPs to:

- bypass Guardian
- mint or extend capabilities
- mutate leases or fencing
- mark artifacts verified
- bypass F07
- mint ReleaseAuthorization
- publish unverified media
- expose unrestricted credentials
- turn generic filesystem access into worker authority
- treat a provider HTTP success as physical completion

## 8. Decision rule

When evaluating a new MCP, classify it as:

1. already exists
2. extends existing rule
3. contradicts existing rule
4. new capability
5. experiment only

Prefer reusing an existing internal adapter when it already provides the needed production boundary.

For any non-trivial MCP change, perform the complete .okf sweep first and consult relevant repository mappings and production-helper evidence.


## 8. Selected MCP Fabric

The detailed implementation is in apps/web/factoryos/core/mcp/.

The selected gateway exposes:
- Playwright: navigation, snapshot, find, guarded click.
- ComfyUI: server info, template discovery, workflow validation, workflow run, image generation, output fetch.
- Qdrant: derived-memory find and projection-only derived store.

All selected MCP results remain untrusted until domain verification.
