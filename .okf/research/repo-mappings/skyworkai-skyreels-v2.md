# SkyReels-V2 → Floor 03 Mapping

Source: https://github.com/SkyworkAI/SkyReels-V2

Observed pattern:
- Long-form generation uses video extension and explicit start/end-frame control.
- Continuity is an explicit generation concern rather than an accidental property of adjacent prompts.

ShortForge mapping:
- Reinforces F03's dependency-boundary LAST_FRAME bindings, ContinuityMode, start/end state hints and surgical regeneration impact.
- No SkyReels-specific continuation runtime is added.

Status: PATTERN_EXTRACTION
