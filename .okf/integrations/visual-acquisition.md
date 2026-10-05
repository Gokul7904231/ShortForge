# Visual Acquisition Providers

Status: CONTRACT-GATED

## Runtime providers

| Provider | Credential | State | Usage control |
|---|---|---|---|
| Pexels | `PEXELS_API_KEY` | IMPLEMENTED | Preserve photographer/source attribution; materialize selected media into ShortForge storage/CAS |
| Pixabay | `PIXABAY_API_KEY` | IMPLEMENTED | Preserve source/creator; cache API results and download selected images to server storage rather than permanent image hotlinks |
| Pexafy | `PEXAFY_API_KEY` | IMPLEMENTED | Preserve source/photographer/license/attribution metadata; Pexafy documents returned photos as free to use without attribution |

## Authority boundary

These providers are visual candidate acquisition resources only. They do not decide:
- F00 evidence truth;
- final visual policy acceptance;
- Treasury admission;
- ComputeRouter placement;
- F06 worker authority;
- CAS identity;
- F07 release.

## Provider constraints

Pexels uses API-key authentication. Its current documentation requires a prominent Pexels link for API usage and recommends photographer credit. Current request/key limits are mutable external service conditions and are not hard-coded into ranking.

Pixabay uses API-key authentication. Its API documentation requires result caching, prohibits systematic mass downloads, and says permanent image hotlinking is not allowed; ShortForge therefore marks selected candidates for download-to-server materialization.

Pexafy uses an `x-api-key` header and a semantic photo-search endpoint. Normalization preserves the response's source, license type, photographer and attribution fields. Pexafy currently documents returned photos as free to use without attribution, while ShortForge still preserves license/source metadata for downstream governance.

## Verification

Deterministic tests prove provider-shaped response normalization, credential boundaries and fail-closed behavior only. IMPLEMENTED does not mean QUALIFIED. A provider-specific live proof is required before any provider is marked QUALIFIED.
