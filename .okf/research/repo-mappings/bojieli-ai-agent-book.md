# AI Agent Book → Floor 03 Mapping

Source: https://github.com/bojieli/ai-agent-book/tree/main

Observed pattern:
- Useful persistent context should be selectively compiled rather than replaying entire conversation history.
- Agent memory should emphasize relevant durable state.

ShortForge mapping:
- F03 emits compact structured planning context: references, continuity locks, states, motion beats, dependencies, and evidence refs.
- Raw history is not treated as the asset authority.

Status: PATTERN_EXTRACTION
