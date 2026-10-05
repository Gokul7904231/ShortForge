# Audio Provider Fabric

Status: CONTRACT-GATED

## TTS providers
- IBM Watson Text to Speech: implementation uses the instance-specific URL, API key/IAM credential boundary, and POST `/v1/synthesize`; ShortForge requests WAV for deterministic physical probing.
- Audexum: implementation uses bearer authentication and POST `/api/synthesize`, explicitly requesting WAV.
- Speak AI: CATALOGUED for media/transcription/analysis. It is not represented as a TTS provider because the current API reference reviewed for this wave documents media/transcription/analysis resources rather than a TTS contract.

## Audio asset provider
- Freesound: APIv2 search uses `/apiv2/search/` with the documented token query parameter. Search results preserve creator, license, source URL and `gen_ai_preference` metadata.

## Authority
Provider execution is not artifact truth. The existing VoiceFabric physical pipeline remains authoritative for audio bytes, duration, codec, SHA-256 and primary/fallback classification. No external provider gains F06/CAS/F07 authority.

## Verification
Deterministic tests validate request/normalization/error behavior. IMPLEMENTED means code-complete and test-covered; QUALIFIED requires an explicit live provider proof with configured credentials and physical output verification.
