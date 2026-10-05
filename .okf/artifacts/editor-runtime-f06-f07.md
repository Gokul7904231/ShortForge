# Editor Runtime and F06/F07 Proof Boundary

> Status: IMPLEMENTED / F06-F07 INTEGRATION PROOF

## Runtime surfaces

The canonical ShortForge editor runtime now exposes:

- durable Editor API: open, inspect, apply, validate;
- deterministic semantic preview planning;
- bounded deterministic command scripting;
- command-only plugin runtime with explicit capability and write permission checks;
- MCP dispatch for inspect, apply, validate, preview and export;
- durable checkpoint, restore, undo, redo and replay;
- headless MP4 export.

A plugin cannot mutate CompositionIR directly. It can only emit an EditorCommand, which is then validated by the same DurableEditor authority and optimistic concurrency boundary as human or agent edits.

## Canonical export path

```
EditorRuntime
    |
    v
DurableEditor
    |
CompositionIR + revision + SHA-256
    |
compileCompositionToRenderIntent()
    |
    v
F06 RenderFabric
    |
ComputeGateway -> ComputePool -> provider
    |
physical RenderArtifact
    |
    v
ContentAddressedStore
    |
cas://<sha256>
    |
    v
F07ReleaseGuardian
    |
F07PhysicalArtifactVerifier
    |-- first CAS digest verification
    |-- independent media probe
    |-- second CAS digest verification
    `-- CAS byte-length verification
    |
signed VerificationReceipt
    |
receipt persisted to CAS
```

The editor does not choose a compute provider, create an economic permit, bypass OKF, authorize publication, or certify F07.

## Composition provenance

Editor-generated RenderIntent carries:

- sourceCompositionId;
- sourceCompositionSchemaVersion;
- sourceCompositionHashSha256;
- canonical CompositionIR JSON.

F06 verifies that the supplied canonical JSON hashes to the declared CompositionIR digest before dispatch. The physical artifact is independently hashed and probed at F07.

## Runtime proof tiers

| Surface | Status |
| --- | --- |
| Editor API | PROVEN |
| MCP dispatch | PROVEN |
| Plugin command runtime | PROVEN for deterministic in-process host plugins |
| Scripted command execution | PROVEN |
| Headless MP4 via RenderFabric | PROVEN by physical integration test |
| CAS binding | PROVEN |
| F07 physical verification | PROVEN |
| F07 cryptographic receipt verification | PROVEN |
| WASM preview execution | NOT PROVEN |
| OpenCut runtime execution | NOT PROVEN |
| Rust compositor | NOT PROVEN |
| Isolated plugin sandbox | NOT PROVEN |

## Acceptance proof

The physical integration test generates a real MP4 with FFmpeg, opens a CompositionIR through DurableEditor, exercises MCP and plugin runtime surfaces, exports through the canonical RenderFabric, stores the produced bytes in CAS, and runs F07ReleaseGuardian against the `cas://` identity.

The test asserts:

- physical output exists;
- F06 artifact SHA-256 is non-empty;
- CAS SHA-256 equals the render artifact digest;
- F07 resolves the CAS object;
- F07 physical probe succeeds;
- F07 receipt is cryptographically valid;
- the F07 receipt is persisted to CAS.

WASM/OpenCut execution remains explicitly unclaimed until separately physically verified.