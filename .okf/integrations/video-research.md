# Video Research Fabric

Status: CONTRACT-GATED

## Providers

| Provider | Capability | Credential | State |
|---|---|---|---|
| Arcmira | Transcript + transcript search | `ARCMIRA_API_KEY` | IMPLEMENTED |
| TranscriptYT | Timestamped transcript | `TRANSCRIPT_YT_API_KEY` | IMPLEMENTED |
| VidWords | Batch transcript | `VIDWORDS_API_KEY` | IMPLEMENTED |
| TubeToTranscript | Timestamped transcript | `TUBETOTRANSCRIPT_API_KEY` | IMPLEMENTED |
| YouTube Data API | Video metadata/search | `YOUTUBE_API_KEY` | IMPLEMENTED |

## Contract boundary

Transcript providers normalize timestamped speech into a common structure. The YouTube Data API is explicitly metadata/search-only for arbitrary public videos; it is not treated as a caption-text provider.

## Authority

Video research is candidate evidence/acquisition. It does not become F00 truth, CAS identity, F06 worker authority, Treasury authority, or F07 release authority.

## Provider facts

Arcmira currently documents `/v1/transcripts/{video_id}` for timestamped transcripts and `/v1/transcripts/search` for indexed spoken-content search. Transcript access is bearer-key authenticated.

TranscriptYT currently documents `GET /v1/transcript`, with JSON segments and optional language/translation parameters; it also exposes an MCP server. REST is used for pipeline execution, while MCP remains an agent access surface.

VidWords currently documents `POST https://vidwords.com/api/transcripts`, Basic authentication, batching up to 50 video IDs, and timestamped segments.

TubeToTranscript currently documents `GET /api/v1/transcript?url=...` with bearer authentication and timestamped transcript rows; it also exposes MCP.

YouTube Data API search uses `GET https://www.googleapis.com/youtube/v3/search` with API-key authentication and quota accounting. Its arbitrary-video caption text is not substituted for a transcript provider.

## Verification

Deterministic fixtures validate provider-shaped parsing, auth headers, malformed/empty result handling and router fallback. Live qualification is a separate provider-specific proof gate and must not be inferred from mocks or HTTP 200 alone.
