# Rendering: OpenCut Adapter Boundary

> Status: EXPERIMENTAL / NON-PRODUCTION
> Source: `apps/web/factoryos/core/render/OpenCutAdapter.ts`

## Purpose

Provide a stable bridge from ShortForge CompositionIR v2 to OpenCut-informed editing/composition capabilities without making OpenCut a runtime authority.

## Authority invariant

OpenCut can consume a composition, but it cannot:

- decide whether a render is admitted;
- choose a compute provider;
- reserve Treasury capacity;
- bypass RenderFabric;
- publish an artifact;
- certify F07;
- mutate canonical provenance outside ShortForge contracts.

## Capability matrix

```
Timeline       -> ADAPTER
Keyframes      -> ADAPTER
Effects        -> ADAPTER
Masks          -> ADAPTER
Captions       -> ADAPTER
Waveform       -> METADATA
Ripple         -> SHORTFORGE TRANSFORM
Editor API     -> ROADMAP
Plugin API     -> ROADMAP
MCP            -> ROADMAP
Headless       -> ROADMAP
Scripting      -> ROADMAP
```

## Runtime proof rule

The adapter intentionally publishes **zero** proven OpenCut execution modes. Editor, WASM preview, headless and MCP remain roadmap targets until each surface is physically verified.

`executionModes = []`

## Fail-closed rule

`OpenCutAdapter.admission().productionEligible === false`

A future runtime integration must not infer production eligibility merely because the OpenCut API exists. It must pass ShortForge capability verification and OKF admission.

## Future promotion gate

```
OpenCut runtime proof
        |
Composition conformance
        |
GPU / WASM benchmark
        |
Audio + temporal precision
        |
Deterministic artifact proof
        |
F06 RenderFabric integration
        |
F07 verification
        |
OKF admission
        |
PRODUCTION
```
