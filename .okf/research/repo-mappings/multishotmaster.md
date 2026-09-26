# MultiShotMaster → Floor 03 Mapping

Source: https://github.com/KlingAIResearch/MultiShotMaster

Observed pattern:
- A global caption can define persistent subject/style/scene properties while per-shot captions carry local shot content.
- Variable shot counts/durations and inter-shot consistency are explicit concerns.

ShortForge mapping:
- F03 separates stable continuity/invariant fields from local prompt/camera/motion data.
- Node-level duration remains explicit.

Not adopted:
- Wan2.1 model architecture.
- Multi-shot inference runtime.

Status: RESEARCH_PATTERN
