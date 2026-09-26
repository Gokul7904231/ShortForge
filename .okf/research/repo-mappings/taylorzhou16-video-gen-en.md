# Repo Mapping — video-gen-en

Repository: https://github.com/taylorzhou16/video-gen-en

Observed pattern:
- Storyboard state is separated from execution tooling.
- Scene/shot layers, time-segmented motion prompts, character/reference mappings, and generation parameters are kept explicit.
- Continuity and aspect-ratio consistency are carried from planning toward execution.

ShortForge mapping:
- F03 already models shot/camera/motion/reference state as provider-neutral data.
- Wave 4 adds explicit continuity reference strategy and stronger semantic identity/fingerprinting for reproducible downstream compilation.

Not adopted:
- Provider routing, API clients, model-specific prompt syntax, or physical media execution.

Status: PATTERN_EXTRACTION
