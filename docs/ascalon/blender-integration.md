# Ascalon ↔ Blender MCP Integration Contract — v1.0

## Purpose

This document defines how Ascalon uses Blender through the ShortForge Capability Registry and the third-party `ahujasid/mcp-for-blender` integration.

The core rule is:

> **Ascalon chooses WHAT should happen. Runtime capability discovery chooses HOW the installed Blender MCP can implement it. Governance decides WHETHER execution is allowed.**

## Canonical runtime path

```
Human / Mission
      ↓
   Ascalon
      ↓
Blender Semantic Action
      ↓
CapabilityRegistry
      ↓
BlenderMcpAdapter
      ↓
MCP initialize
      ↓
MCP tools/list
      ↓
approved semantic-action → concrete-tool resolution
      ↓
MCP tools/call
      ↓
Blender addon / Blender
      ↓
independent observation
      ↓
Ascalon next decision
```

## Responsibilities

### Ascalon

Ascalon is responsible for:
- understanding the visual intent;
- choosing a semantic Blender action;
- deciding required provider parameters where relevant;
- choosing when inspection or verification is needed;
- producing a typed visual plan;
- learning from verified Blender trajectories.

Ascalon is NOT responsible for:
- inventing an MCP tool name;
- deciding whether Guardian policy permits execution;
- treating a successful MCP response as physical truth;
- granting itself arbitrary Python access;
- bypassing CapabilityRegistry.

### CapabilityRegistry

CapabilityRegistry is responsible for:
- role and floor authorization;
- environment gating;
- production routability;
- Guardian-gated execution metadata;
- keeping Blender behind one capability gateway.

The canonical registry capability is `blender.mcp`.

### BlenderMcpAdapter

The adapter is responsible for:
- launching the configured MCP server;
- protocol initialization;
- live tool discovery;
- deterministic semantic-action resolution;
- tool invocation;
- bounded request timeout;
- bounded response size;
- disconnect cleanup;
- request hashing;
- verification hints.

### mcp-for-blender

The third-party MCP server is responsible for:
- bridging MCP to the Blender addon;
- exposing Blender tools;
- forwarding allowed Blender operations to the addon.

Current upstream package is `mcp-for-blender 2.1.1`. The repository states that the addon opens a socket listener and that its socket transport has no authentication/encryption; production deployment must therefore keep the Blender socket on a trusted private interface and rely on the surrounding worker/network boundary. The project's safe mode can validate scripts and block risky OS/network/file behavior while allowing normal Blender operations.

## Semantic decision model

Ascalon emits:

```json
{
  "action": "CAMERA_CONFIGURE",
  "arguments": {
    "shotId": "shot_04",
    "framing": "medium_close",
    "movement": "slow_orbit"
  }
}
```

It does NOT emit:

```json
{
  "tool": "execute_blender_code"
}
```

The runtime resolves `CAMERA_CONFIGURE` to an installed, currently advertised MCP tool.

## Why semantic actions matter

MCP tool names and available capabilities can change across versions, addon states and optional features. Semantic actions keep Ascalon's learned decision vocabulary stable while runtime discovery remains current.

This also reduces training contamination: Ascalon does not learn that one provider-specific implementation is permanently authoritative.

## Action classes

### Read-only

`SCENE_INSPECT`, `OBJECT_INSPECT`, `VIEWPORT_CAPTURE`, and provider search operations.

These can be used to build situational awareness but their outputs remain observations, not guarantees about downstream artifacts.

### Mutating

Object/material/camera/lighting/animation/compositor/sequence changes.

Mutations require a Guardian-gated CapabilityRegistry path and should be followed by observation.

### High-risk

Deletion, simulations, procedural generation, rendering and external asset generation.

These receive explicit risk metadata and require stronger verification.

### Critical

`PYTHON_EXECUTE` is the only generic escape hatch.

Production default: disabled.

Enable only for an explicitly authorized workflow where no constrained semantic capability can express the operation.

## Runtime resolution policy

1. Discover the live MCP capability set.
2. Select only from the semantic action's approved tool candidates.
3. Never trust a raw tool name from Ascalon's model output.
4. Require explicit provider selection for multi-provider asset operations.
5. Refuse ambiguous or unavailable mappings.
6. Keep the raw resolved tool in execution telemetry, not in the primary learned decision vocabulary.

## Provider selection

Asset actions have multiple upstream families:

- Poly Haven
- Sketchfab
- Poly Pizza
- Hyper3D
- Hunyuan3D
- Tripo

Ascalon must explicitly decide the provider where the action ontology requires one. It must not choose a provider simply because it appears first in a tool list.

## Verification loop

For mutations:

```
DECISION
 → AUTHORIZATION
 → EXECUTION
 → OBSERVATION
 → COMPARE AGAINST INTENT
 → VERIFIED / FAILED / UNRESOLVED
```

For rendering:

```
RENDER REQUEST
 → MCP CALL
 → PHYSICAL FILE
 → existence check
 → metadata check
 → SHA-256
 → F06/F07 evidence
```

A successful `tools/call` only proves the communication path returned successfully. It does not prove that the requested Blender scene or render artifact is correct.

## Training contract

A Blender trajectory is eligible only when:

- the semantic action is known;
- the resolved MCP tool was actually advertised at runtime;
- authorization agrees with the execution;
- the environment is correctly labeled;
- the final outcome is independently verified;
- no secrets/credentials/PII are present;
- arbitrary Python use is explicitly labeled and authorized;
- the trajectory can be replayed or its nondeterministic boundary is explicitly documented.

### Preferred training labels

```
decision.semanticAction
decision.intent
decision.preconditions
decision.provider
execution.resolvedTool
execution.capabilitySnapshotDigest
execution.requestDigestSha256
outcome.verificationEvidenceId
outcome.status
provenance.labelSource
```

## Negative examples Ascalon must learn

- wrong floor requests Blender mutation;
- unknown Blender tool;
- ambiguous asset provider;
- scene mutation without prior required observation;
- deletion without authorization;
- Python execution without dangerous capability grant;
- render call returns success but no physical artifact exists;
- screenshot shows an old Blender file;
- addon protocol/version mismatch;
- tool disappears after runtime discovery;
- external asset generation says completed but import fails;
- Blender reports success but scene state contradicts the intended visual plan.

## Deployment notes

For production workers:

1. Pin the `mcp-for-blender` package version.
2. Pre-install/prewarm the runtime instead of relying on an unbounded network fetch at job time.
3. Enable safe mode.
4. Disable third-party telemetry unless an explicit data-governance decision authorizes it.
5. Keep the Blender socket private.
6. Prefer one Blender MCP process per Blender worker/session.
7. Assign one mission/floor-scoped worker context to each session.
8. Record the MCP protocol version, server version and tool snapshot digest.
9. Do not expose raw Python capability to the general Ascalon policy.
10. Treat Blender output as evidence only after independent observation.

## Compatibility boundary

The current implementation is deliberately Node-side and must not be bundled into Edge/Cloudflare execution paths. Blender is a worker-side execution dependency.

## Upstream evidence

Current upstream documentation states:
- package name is now `mcp-for-blender`;
- current repo version is 2.1.1;
- MCP server and Blender addon are separate components;
- the addon provides a socket-based connection;
- code execution is supported;
- safe mode is available;
- the socket itself has no authentication/encryption.

Source: https://github.com/ahujasid/mcp-for-blender
