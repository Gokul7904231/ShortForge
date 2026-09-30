# Blender MCP Production Worker Contract — 2026-09-30

## Scope

Blender is a worker-side execution dependency for ShortForge. It must not be bundled into Edge/Cloudflare execution.

## Required components

1. Blender installation on the worker.
2. MCP for Blender addon installed in the worker's Blender installation.
3. MCP for Blender server pinned to version `2.1.1`.
4. ShortForge Node runtime with `BlenderMcpAdapter`.
5. Private communication boundary between the MCP server and Blender addon.

## Recommended process boundary

```
ShortForge Worker
   |
   +-- Node FactoryOS
   |      |
   |      +-- CapabilityRegistry
   |              |
   |              +-- BlenderMcpAdapter
   |
   +-- pinned mcp-for-blender process
   |
   +-- Blender process + addon
```

One Blender MCP server should own one Blender session. Do not run competing MCP clients against the same addon session.

## Runtime configuration

### Minimum

```
BLENDER_MCP_ENABLED=true
BLENDER_MCP_COMMAND=<absolute pinned executable>
BLENDER_MCP_ARGS_JSON=<pinned command arguments as JSON array>
BLENDER_HOST=127.0.0.1
BLENDER_PORT=9876
BLENDER_MCP_SAFE_MODE=1
BLENDER_MCP_ALLOW_PYTHON=false
DISABLE_TELEMETRY=true
```

### Development fallback

The adapter's default command is:

```
uvx --from mcp-for-blender==2.1.1 mcp-for-blender
```

Production workers should preferably use a preinstalled/pinned environment so a job does not depend on a package download at execution time.

## Network security

The upstream project documents that the Blender addon socket has no authentication/encryption.

Therefore:
- keep the listener on loopback or a private worker network;
- do not expose port 9876 publicly;
- use a trusted network boundary for remote worker placement;
- if a remote tunnel is required, use an authenticated encrypted tunnel instead of exposing the addon socket directly.

## Safe mode

ShortForge defaults to `BLENDER_MCP_SAFE_MODE=1`.

Safe mode is an additional defense layer, not the authority layer. CapabilityRegistry and Guardian remain authoritative.

## Python execution

`execute_blender_code` is intentionally treated as a privileged escape hatch.

Production default:

```
BLENDER_MCP_ALLOW_PYTHON=false
```

Enabling it requires:
- an authorized semantic `PYTHON_EXECUTE` action;
- Guardian approval;
- explicit request flag;
- trajectory labeling;
- independent state verification.

## Startup/readiness gate

A Blender worker should not advertise ready until:
1. Blender process exists.
2. MCP addon is enabled.
3. MCP server starts successfully.
4. MCP initialize succeeds.
5. MCP tools/list returns at least the required inspection capability.
6. the addon status is current/compatible.
7. a scene inspection succeeds.
8. no unauthorized capability is exposed.

## Required production acceptance tests

### Connectivity
- initialize/handshake
- protocol version negotiation
- tools/list discovery
- reconnect after MCP process exit

### Semantic routing
- SCENE_INSPECT → get_scene_info
- OBJECT_INSPECT → get_object_info
- VIEWPORT_CAPTURE → current screenshot tool
- RENDER → render implementation
- ASSET_SEARCH → explicit provider
- ambiguous provider → rejection
- PYTHON_EXECUTE → rejected by default

### Verification
- mutation followed by scene inspection
- render followed by physical artifact existence + metadata + SHA-256
- export followed by physical file existence + SHA-256
- stale/old scene observation rejected where the workflow requires current state

### Failure handling
- MCP unavailable
- addon unavailable
- tool disappears after discovery
- timeout
- response-size overflow
- malformed MCP response
- denied Python capability
- provider unavailable
- render failure
- reconnect

## Observability

Record:
- missionId
- jobId
- floorId
- semanticAction
- resolvedTool
- protocolVersion
- serverVersion
- capabilitySnapshot digest
- request digest
- duration
- retry attempt
- result classification
- independent verification evidence
- policy decision

Do not store raw secrets, credential-bearing Python or unrestricted payloads in training telemetry.

## Release rule

Code integration can be merged only after normal repository CI passes.

Production enablement requires a separate live-worker acceptance run. A code-level green CI result must not be represented as proof that Blender itself is operational.

