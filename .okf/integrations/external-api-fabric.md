# External API Fabric

> Status: CANONICAL / CONTRACT-GATED
> Scope: External research, media, inference, audio, safety and context providers.

## Authority

External APIs are replaceable provider resources. They do not become authorities for:
- truth verification;
- ComputeRouter placement;
- Treasury admission/settlement;
- F06 worker authority;
- CAS artifact identity;
- F07 release verification;
- Overseer authority.

MCP is an access/tool surface only.

## Current integration roadmap

| Domain | Providers | State |
|---|---|---|
| Academic research | OpenAlex, arXiv, Semantic Scholar, Crossref, Unpaywall | IMPLEMENTED adapters |
| Premium research MCP | Perplexity remote MCP | IMPLEMENTED adapter; metered |
| Visual acquisition | Pexels, Pixabay, Pexafy | IMPLEMENTED registry/adapter wave target |
| Video research | Arcmira, TranscriptYT, TubeToTranscript, YouTube | IMPLEMENTED registry/adapter wave target |
| Video research | VidWords | IMPLEMENTED runtime adapter; live qualification separate |
| LLM | Gemini, Groq, OpenRouter | EXISTING IMPLEMENTATIONS |
| LLM | Hugging Face | PARTIAL — legacy provider adapter is still a stub and must be replaced |
| Audio | IBM TTS | CATALOGUED — service URL is instance/region specific |
| Audio | Audexum | IMPLEMENTED registry target |
| Video/audio analysis | Speak AI | CATALOGUED — endpoint workflow verification required |
| Audio assets | Freesound | IMPLEMENTED registry target |
| Document/safety | OCR.Space, Safe Browsing, URLScan | IMPLEMENTED registry target |
| Safety | Perspective API | CATALOGUED pending endpoint verification |
| Context | Open-Meteo, Nominatim | IMPLEMENTED registry target |

## SDLC

1. Architecture/contract review.
2. Provider adapter implementation.
3. Deterministic contract tests with mocked transport.
4. Security/credential/SSRF review.
5. Provider health/capability discovery.
6. Manual live verification for configured external credentials.
7. Team Change Gate and affected-floor CI.
8. Update this ledger with observed evidence.
9. Merge only after current-main validation.

## Credential policy

Secrets are server-side only. They must never enter:
- MCP prompts;
- operation journals;
- evidence snippets;
- Team reports;
- client-visible configuration;
- CAS artifact metadata.

## Evidence policy

HTTP 200 is not proof of usable media or research truth. A live provider qualification record must include the provider request, normalized result, relevant artifact/evidence identity, and explicit capability outcome.

## Reach integration

F00 retains research judgment.
Reach owns acquisition.
Academic providers return candidate EvidenceSource records.
Unpaywall is DOI-enrichment only and requires a DOI parameter.
Perplexity MCP is a metered premium research tool; the reasoning model may be Gemini, Groq, OpenRouter, Hugging Face, or local inference independently.

## License / attribution

Visual providers must preserve source, license, photographer/author and attribution instructions before selection. Providers described as “free” are not treated as a blanket legal authorization; downstream usage policy remains explicit.

## Operational caveats

Nominatim public-service usage is strictly rate-limited and must be cached, identified, and swappable. Open-Meteo terms vary by use case. Provider quotas and pricing are runtime facts and must not be hard-coded as permanent truth.
