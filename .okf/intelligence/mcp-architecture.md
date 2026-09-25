# ShortForge / FactoryOS — MCP Architecture

> **Status:** LOCKED DIRECTION / GOOGLE DRIVE MCP IMPLEMENTED (UNVERIFIED IN THIS COMMIT)
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

The current minimum MCP set is intentionally small:

| MCP | Role | Status | Boundary |
|---|---|---|---|
| GitHub | Engineering source, code review, Devourer repository research | EXISTING | Development / governance |
| Google Drive | Artifact/knowledge import-export and operator file management | IMPLEMENTED | Bounded storage integration |
| Browser / DevTools MCP | F00 web research, diagnostics, browser-grounded inspection | PLANNED / OPTIONAL HOST | Sensor/research only |

A fourth MCP is not automatically required. Add another MCP only when a concrete workflow cannot be served by the existing provider-adapter or internal subsystem.

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
