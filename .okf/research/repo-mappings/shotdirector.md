# ShotDirector → Floor 03 Mapping

Source: https://github.com/UknowSth/ShotDirector

Observed research pattern:
- Multi-shot generation benefits from explicit cinematographic transition semantics and parameter-level camera control.
- Shot transitions are an intentional directorial artifact, not merely sequential prompts.

ShortForge mapping:
- F03 now carries richer camera semantics and continuity mode so downstream systems can distinguish intentional continuity from independent cuts.
- No provider/model-specific camera representation is embedded.

Status: RESEARCH_PATTERN
