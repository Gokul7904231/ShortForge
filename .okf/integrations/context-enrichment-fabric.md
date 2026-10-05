# Context Enrichment Provider Fabric

Status: CONTRACT-GATED

## Open-Meteo
- Adapter uses /v1/forecast with explicit latitude/longitude and caller-selected current/hourly variables.
- No API key is required for the public endpoint.
- Runtime terms/licensing remain external facts and are not hard-coded into routing.

## Nominatim
- Adapter supports deliberate /search and /reverse use only; it does not expose autocomplete or systematic grid querying.
- Requests use an identifying User-Agent and optional Referer.
- The public service is protected by a strict maximum of one request per second; the adapter serializes requests per process and caches repeated queries.
- The public endpoint must remain swappable through NOMINATIM_BASE_URL. For distributed/regular workloads, ShortForge must use a separately provisioned provider rather than scaling public Nominatim traffic horizontally.
- Attribution and ODbL obligations remain application-level responsibilities.

## Authority
Context providers produce enrichment inputs only. They do not become F00 research truth, Guardian safety policy, Treasury authority, ComputeRouter placement, F06 execution, CAS identity or F07 release authority.

## Verification
Deterministic tests cover coordinate validation, request normalization, User-Agent policy and caching. Live qualification remains a separate provider-term-respecting gate.
