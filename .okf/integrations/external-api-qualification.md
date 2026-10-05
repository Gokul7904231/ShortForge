# External API Qualification

> Status: IMPLEMENTATION COMPLETE / LIVE QUALIFICATION IN PROGRESS
> Scope: Qualification evidence for the 28-provider External API Fabric.

## Lifecycle boundary

\`IMPLEMENTED\` means the adapter, contract, deterministic tests and repository gates exist.

\`QUALIFIED\` means a provider-specific live request demonstrated the representative capability under real credentials/configuration and produced sanitized evidence.

\`CONFIGURED-BUT-NOT-QUALIFIED\` means configuration exists or the provider can be evaluated, but the live capability proof has not passed.

\`NOT-APPLICABLE\` is reserved for a provider that cannot or should not be live-qualified under the approved ShortForge deployment scope.

HTTP success, mocked tests, model-list responses, or provider-declared metadata alone never create \`QUALIFIED\`.

## Canonical 28-provider matrix

| Domain | Provider IDs | Live proof |
|---|---|---|
| Research / Reach | openalex, arxiv, semantic_scholar, crossref, unpaywall | bounded representative research result |
| Premium research MCP | perplexity_mcp | MCP initialize + \`tools/list\`; \`perplexity_search\` capability; metered authorization required |
| Visual | pexels, pixabay, pexafy | search + explicit representative asset materialization + byte/hash evidence |
| Video research | arcmira, transcriptyt, vidwords, tubetotranscript, youtube_data_api | timestamped transcript or metadata/search capability |
| LLM | gemini, groq, openrouter, huggingface | model access plus explicit minimal inference when \`llm_probe=true\`; metered authorization required |
| Audio | ibm_tts, audexum, speak_ai, freesound | TTS bytes + physical audio verification, or authenticated media/search capability |
| Safety / document | ocr_space, perspective, google_safe_browsing, urlscan | representative OCR/safety result; urlscan uses private visibility and creates a real scan |
| Context | open_meteo, nominatim | representative forecast/geocode result with provider policy constraints |

## Control rules

### Safe mode
Default command:

\`npm run factoryos:verify:external-apis\`

This performs configuration inspection only and must not make network requests.

### Live mode
Live execution is single-provider and manual through \`.github/workflows/external-api-qualification.yml\`.

Required inputs:
- provider id;
- \`live=true\`;
- \`allow_metered=true\` for metered or destructive probes.

Additional gates:
- visual qualification requires \`materialize=true\`;
- LLM inference requires \`llm_probe=true\`;
- Google Safe Browsing requires \`SAFE_BROWSING_NONCOMMERCIAL_CONFIRMED=true\`;
- Nominatim requires an identifying \`NOMINATIM_USER_AGENT\`.

## Credential boundary

Provider credentials are injected as runtime secrets only.

They must never be included in:
- source control;
- prompts;
- operation journals;
- Team reports;
- evidence JSON;
- client-visible configuration.

Provider URLs containing query credentials are never emitted as evidence.

## Evidence contract

Every live result records:
- provider id;
- GitHub run id or generated qualification run id;
- execution mode;
- disposition;
- authentication/configuration state;
- HTTP status and duration;
- request id when supplied;
- retry/rate-limit signals when supplied;
- bounded normalized response shape;
- physical audio or visual materialization hash/size when applicable;
- explicit error code when qualification fails.

Raw provider bodies are intentionally excluded.

## Authority boundary

The qualification harness never grants:
- F00 research truth;
- Treasury admission or settlement authority;
- ComputeRouter authority;
- F06 worker authority;
- CAS artifact identity;
- F07 release verification;
- Overseer authority.

Perplexity remains a remote MCP tool surface. Its reasoning model is selected independently by ShortForge's model router.

## SDLC

1. Issue / scope.
2. Typed qualification contract.
3. Provider-specific probe definition.
4. Deterministic safety and guard tests.
5. Team Change Gate.
6. Repository CI.
7. Manual live provider run.
8. Review normalized result and evidence.
9. Update provider disposition ledger.
10. Close #184 only after every provider has an explicit evidence-backed disposition.

## Current state

No provider in this qualification wave is automatically promoted to \`QUALIFIED\` by this code change. Provider-by-provider live evidence remains an operational gate.
