# StoryForgeAI → Floor 03 Mapping

Source: https://github.com/jamesbas/storyforgeai

Observed pattern:
- Structured storyboard package rather than one large prompt.
- Separate world/visual bible, directorial plan, cinematography plan, art direction, scene cards, and generation manifests.
- Scene-level variants and animatic review before expensive generation.

ShortForge mapping:
- Adopt the separation of semantic scene intent from provider execution.
- Use only the bounded subset needed by F03: shot/camera, continuity, references, timing hints, and repair metadata.
- Preserve F02 as narrative owner; F03 remains a visual specification compiler.

Not adopted:
- Provider/model routing.
- Physical generation.
- Project/UI orchestration.

Status: PATTERN_EXTRACTION
