# Editor Feature Lowering / F06 Physical Proof

Status: IMPLEMENTED / GATE-PENDING

The editor wave now lowers canonical CompositionIR features into RenderIntent and the existing FactoryOS F06 renderer.

Physical lowering coverage:
- effects -> Pillow feature operations
- masks -> deterministic alpha geometry
- keyframes -> frame-time interpolation
- transitions -> deterministic frame compositing
- audio -> FFmpeg source trim, playback-rate, offsets, volume and fades
- canvas background -> explicit solid/gradient/blur scene background
- preview -> deterministic physical PNG frame via the same RenderFabric handoff normalization

Production authority remains:

`Editor -> CompositionIR -> RenderIntent -> F06 RenderFabric -> ComputeRouter -> artifact -> CAS -> F07`

Preview is not publication authority and does not create a production render admission. OpenCut/WASM/Rust/isolated-plugin runtime execution remain explicitly unproven.
