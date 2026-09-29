# Repository Mapping: MCG-NJU/VideoChat3

Status: FUTURE BUILD REFERENCE
Adoption: RESEARCH_PATTERN
Primary domain: long-form video reasoning and temporal grounding

Source:
- https://github.com/MCG-NJU/VideoChat3
- Inspected 2026-09-26; 2026 release.

Observed mechanism:
- 4B generalist video MLLM for fine-grained motion, long-video reasoning, temporal grounding and online/streaming understanding.
- Combines spatiotemporal compression with adaptive frame resolution so closer visual inspection can be allocated where evidence is needed.
- Upstream reports long-form use and publicly released model/data/evaluation resources.

ShortForge treatment:
- Candidate second-stage semantic judge over a pre-indexed movie, not first-pass frame ingestion.
- Use coarse scene embeddings/anchors first, then request higher-resolution temporal evidence only around candidate windows.
- Emit typed temporal evidence rather than free-form highlight judgments.

Limitations:
- Model inference and training are significant compute operations.
- General video understanding is not automatically equivalent to cinematic quality or legal reuse.

Authority:
- Research only; no sovereign decision authority.
