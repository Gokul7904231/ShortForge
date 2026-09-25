# Code2Video → Floor 03 Mapping

Source: https://github.com/showlab/Code2Video

Observed pattern:
- Planner, coder, and critic roles are separated.
- Structured intermediate artifacts are evaluated before expensive downstream generation.
- Evaluation includes efficiency and end-to-end quality dimensions.

ShortForge mapping:
- Supports keeping planning separate from scene-quality judgment.
- F03 remains a deterministic/provider-neutral plan compiler; quality judges remain separate agents.

Not adopted:
- Manim/code-centric rendering as an F03 responsibility.

Status: RESEARCH_ONLY
