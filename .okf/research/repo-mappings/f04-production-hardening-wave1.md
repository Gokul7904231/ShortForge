# Floor 04 Screened Research & Adoption Ledger — 2026-09-26

External sources are evidence only. Executable ShortForge contracts, tests, Guardian policy and .okf remain authoritative.

## Research findings

| Source | Signal | ShortForge treatment |
|---|---|---|
| OpenAssetIO | Logical entity identity, opaque references, versions and traits separated from physical location | ADOPTED: F04 assets now carry source-spec identity and provider execution separately; F03 owns logical asset intent |
| LTX-2 | Explicit image/video conditioning, keyframe-index conditioning and synchronized audio/video generation | ADOPTED AS BOUNDARY: F03 conditioning remains provider-neutral; future F04 adapters can consume first/last-frame and video references without changing F03 authority |
| HunyuanVideo-1.5 | 8.3B T2V/I2V, step-distilled paths, caching, SR, consumer GPU orientation | CANDIDATE PROVIDER: evaluate behind F04 provider registry; no provider is promoted merely from research |
| Wan2.2 | MoE, cinematic aesthetics, complex motion, 5B hybrid T2V/I2V 720p/24fps | CANDIDATE PROVIDER: compatible with F03 typed camera/conditioning semantics but requires adapter + benchmark + policy approval |
| VBench-2.0 | 18-dimension evaluation across technical and intrinsic video capabilities | ADOPTED AS EVALUATION BOUNDARY: F04 records provider/runtime evidence; quality judgment remains downstream quality verification |
| C2PA 2.4 | tamper-evident provenance, new assertions, crJSON and repository receipt | ADOPTED AS FUTURE PROVENANCE BOUNDARY: signing remains downstream/F07, not F04 authorization |
| Existing ShortForge image provider registry | Provider-neutral ImageProvider interface, health/cost/speed/model metadata | ADOPTED: F04 now has an equivalent bounded provider-selection seam rather than hard-coding a provider |
| Existing ShortForge AudioPipeline | ffprobe inspection, canonical WAV conversion, validation, cache/checkpoint registration | ADOPTED CONCEPTUALLY: F04 deterministic fallback now outputs real WAV and validates physical duration; TS pipeline remains the richer production audio path candidate |

## Non-conflict checks

- F03 remains planning/specification; F04 owns physical media execution.
- F03 and F04 remain parallel predecessors of F05.
- Guardian remains the authorization authority.
- F04 workers remain untrusted executors whose artifacts must pass physical validation.
- F05 remains timeline semantics; F07 remains final physical/semantic release verification.
- Research does not grant providers credentials, execution permission, or release authority.

## Promoted implementation changes

1. F04 handoff now requires AssetPlanIR and exact semantic plan fingerprint linkage.
2. Every physical F04 asset carries its source plan fingerprint and provider execution record.
3. Physical PNG dimensions and WAV/MP3 duration are checked from actual bytes/decoder evidence.
4. Deterministic fallback workers now create real standards-valid PNG/WAV artifacts instead of fake headers.
5. Deterministic background audio is no longer mislabeled as licensed stock audio.
6. Registry writes are atomic and reject checksum identity collisions.
7. Crash reconciliation quarantines ambiguous/corrupt evidence instead of deleting it.
8. Provider selection is isolated in an allowlist registry with health checks and deterministic fallback descriptors.
9. F05 now enforces exact F03-plan lineage at its join boundary and checks timeline asset references at handoff.
10. F03 handoffs now require a semantic AssetPlanIR fingerprint and matching script/plan lineage.

## Explicit non-adoption

- No model/provider is made canonical by research alone.
- No provider credentials move into F03.
- No C2PA signing authority moves into F04.
- No VBench score becomes an automatic release decision.
- No third-party source code, model weights, prompts, or licenses are copied into ShortForge.
