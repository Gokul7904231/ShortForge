# ShotDirector research → Floor 03 Mapping

Source used for this mapping: https://github.com/zhaoyang97/Paper-Notes-en/blob/148a16dd45b148e890b4428db21133e5a1589b77/docs/CVPR2026/video_generation/shotdirector_directorially_controllable_multi-shot_video_generation_with_cinemat.md

Source note:
- The upstream ShotDirector repository itself was not verified as an accessible GitHub repository in this sweep.
- The architectural observations below therefore come from the public paper-notes record, not from unverified implementation code.

Observed research pattern:
- Multi-shot generation benefits from explicit cinematographic transition semantics and parameter-level camera control.
- Shot transitions can be treated as an explicit directorial artifact rather than only sequential prompts.

ShortForge mapping:
- F03 now carries richer provider-neutral camera semantics and continuity mode.
- This lets downstream systems distinguish intentional continuity from independent cuts without binding F03 to a model/provider.

Not adopted:
- Any unverified provider implementation.
- Provider/model-specific camera syntax.

Status: RESEARCH_ONLY
