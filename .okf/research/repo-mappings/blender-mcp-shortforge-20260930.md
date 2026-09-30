# Blender MCP → ShortForge Research Mapping — 2026-09-30

## Source

Repository: https://github.com/ahujasid/mcp-for-blender

Current upstream release observed: **2.1.1**.

The upstream project is a third-party Blender integration, not an official Blender component. It consists of a Blender addon and an MCP server. The MCP server communicates with Blender through the addon's socket interface. It exposes scene inspection, object/material manipulation, arbitrary Blender Python, asset providers, export, viewport and other tools.

## What ShortForge adopts

### 1. MCP as integration protocol

ShortForge uses MCP only as the adapter protocol.

The semantic decision vocabulary remains ShortForge-owned.

### 2. Runtime capability discovery

At connection time the adapter performs:
- `initialize`
- `notifications/initialized`
- `tools/list` with cursor pagination

The resulting capability snapshot is runtime state and is not treated as training truth.

### 3. Persistent worker-side session

ShortForge creates one reusable Blender MCP adapter/session per canonical CapabilityRegistry instance instead of spawning a new server for every operation.

### 4. Safe mode

ShortForge defaults the third-party server to:

```
BLENDER_MCP_SAFE_MODE=1
```

and:

```
DISABLE_TELEMETRY=true
```

unless deployment configuration explicitly overrides the policy.

### 5. Semantic action indirection

Ascalon chooses:

```
OBJECT_CREATE
CAMERA_CONFIGURE
RENDER
SCENE_INSPECT
...
```

The adapter resolves the semantic action to a currently advertised MCP tool.

Raw MCP tool names are implementation metadata.

### 6. Explicit provider selection

For multi-provider asset actions, Ascalon must select the provider explicitly. The adapter refuses ambiguous provider resolution.

### 7. Arbitrary Python remains privileged

`execute_blender_code` can express very broad Blender operations.

ShortForge therefore treats `PYTHON_EXECUTE` as CRITICAL:
- Guardian-gated;
- disabled by default;
- explicit request flag required;
- trajectory label required;
- independently verified after execution.

## What ShortForge does not adopt

- No direct copy of upstream Blender addon source into ShortForge.
- No unrestricted trust of the addon socket.
- No use of MCP tool names as Ascalon authority.
- No assumption that an MCP success response proves the physical scene is correct.
- No reliance on a live public network connection during production jobs.
- No training on third-party telemetry or unverified external trajectories.

## ShortForge-specific safety additions

```
Ascalon
  ↓
semantic Blender action
  ↓
Capability Registry
  ↓
Guardian policy
  ↓
Blender MCP Adapter
  ↓
runtime tools/list
  ↓
MCP tools/call
  ↓
Blender
  ↓
independent observation
  ↓
evidence
```

This is intentionally stricter than a generic MCP client.

## Production deployment requirements

- pin `mcp-for-blender` version;
- preinstall/prewarm the Python environment;
- keep Blender socket private;
- use one MCP server per Blender session;
- enforce worker-level CPU/GPU/memory/time quotas;
- record protocol/server/tool snapshot digests;
- collect execution and verification telemetry;
- isolate secrets from Blender Python inputs;
- independently verify exported/rendered physical artifacts.

## Upstream limitations relevant to ShortForge

The upstream project documents that the Blender addon socket has no authentication or encryption. Therefore a remote deployment must not expose the socket directly to an untrusted network; the worker/private-network boundary must provide isolation.

The upstream project also documents arbitrary Python execution by default and provides safe mode to validate scripts and block risky filesystem/network/process behavior. ShortForge uses safe mode by default but still treats Python execution as privileged because policy cannot rely on a third-party safety filter as the sole authorization mechanism.

## Training mapping

Source concepts are converted into ShortForge's canonical learning categories:

- tool discovery → runtime observation
- Blender operation → semantic action
- tool parameters → implementation payload
- Blender result → observation
- physical render/export → evidence
- user correction → training feedback
- wrong tool / wrong provider / stale scene / failed render → negative trajectory

Ascalon learns the decision policy, not the authority boundary.

