# Repository Mapping: OpenGVLab/VideoChat-Flash

Status: FUTURE BUILD REFERENCE
Adoption: RESEARCH_PATTERN
Primary domain: efficient ultra-long video understanding and temporal localization

Source:
- https://github.com/OpenGVLab/VideoChat-Flash
- Inspected 2026-09-26

Observed mechanism:
- Hierarchical compression for long-context video.
- Upstream README reports support for videos up to about three hours, 10,000-frame needle-in-a-haystack evaluation, temporal localization, and a compact 16-token-per-frame representation.

ShortForge treatment:
- Candidate long-context retrieval layer for movie evidence indexing.
- Use compressed representations to locate candidate story/event windows before expensive fine-grained analysis.
- Preserve evidence links back to source frame/time ranges.

Limitations:
- Benchmark performance does not establish movie-highlight quality on its own.
- Large models still require isolated compute and evaluation under ShortForge provider boundaries.

Authority:
- Research only. It must not bypass Movie Source Analyzer, Overseer, or F07.
