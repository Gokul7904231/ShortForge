# Repository Mapping: fil-mp/LongVideoUnderstanding (MovieChat)

Status: FUTURE BUILD REFERENCE
Adoption: RESEARCH_PATTERN
Primary domain: long-video sparse-memory understanding

Source:
- https://github.com/fil-mp/LongVideoUnderstanding
- Inspected 2026-09-26; CVPR 2024 MovieChat repository.

Observed mechanism:
- Uses a dense-token to sparse-memory strategy for long videos.
- Upstream README reports operation on more than 10,000 frames on a 24 GB GPU and provides MovieChat-1K evaluation resources.

ShortForge treatment:
- Use the architecture idea for a MovieEvidenceMemory representation: stable scene summaries, temporal anchors, salient frame references, and retrieval links.
- Do not send every frame of a movie to a language model.
- Keep memory entries traceable to exact source ranges and model/version evidence.

Limitations:
- The project targets long-video understanding/QA rather than production-grade highlight extraction.
- It does not provide ShortForge rights/provenance gates or release authority.

Authority:
- Research pattern only. It informs evidence compression, not orchestration authority.
