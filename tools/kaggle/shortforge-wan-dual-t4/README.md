# ShortForge Wan Dual-T4 Kaggle Renderer

This directory is a ShortForge-owned Kaggle kernel template.

The design borrows only publicly documented/runtime-proven ideas from current Kaggle/Wan examples:
- detect the actual GPU inventory;
- explicitly gate the dual-T4 profile;
- use Wan 2.1 Diffusers;
- use balanced device placement when two GPUs are visible;
- use Kaggle Secrets for optional `HF_TOKEN`;
- generate at a native lower resolution and package/upscale to the ShortForge 9:16 MP4 target with FFmpeg.

Kaggle currently documents T4 x2 as the available notebook GPU option after the P100 sunset. The public Wan Dual-T4 Runner demonstrates hardware-aware model profile switching, while the public Wan I2V example demonstrates vertical 9:16 packaging. These are references, not ShortForge runtime dependencies.

## Modes

- `shortforge-deterministic`: no model download; GPU-backed deterministic proof.
- `wan2.1`: model-backed text-to-video mode.

The default proof path is deliberately deterministic so provider qualification can remain fast and reproducible. Wan model execution must be explicitly selected.

## Recommended profiles

- `WAN_T2V_1_3B`: lower-risk model-backed smoke.
- `WAN_DUAL_T4_14B`: explicit dual-T4 14B experiment. Its actual Kaggle feasibility must be demonstrated by a live run before being treated as production-ready.

## Artifact

The runner writes exactly one final MP4 under:

`/kaggle/working/shortforge/outputs/`

ShortForge remains responsible for SHA-256, byte-length, CAS and F07 verification after download.
