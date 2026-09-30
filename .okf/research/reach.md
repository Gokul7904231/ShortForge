# Research: Reach Provider Fabric

> Status: CANONICAL / IMPLEMENTATION-ALIGNED / CONTRACT-GATED
> Scope: Floor 00 external research acquisition

## 1. Core invariant

Reach is the permanent research capability; retrieval providers are replaceable resources.

Content Engine Contract -> F00 Research -> Reach Gate -> Cache -> Provider Router -> Evidence Intake -> F00 Verification -> Research Passport.

Ascalon requests research intent but does not select retrieval providers.

## 2. Provider roles

### SearXNG
Default low-cost/open-source discovery provider. It is a discovery layer, not an unlimited guarantee: upstream search engines can throttle, block, or become unavailable.

### Decodo Fast Search
Quota-governed structured search for precision/current research or fallback when baseline acquisition is insufficient.

### Decodo Web Scraping
Quota-governed deep retrieval for a URL already discovered by Reach. It is not an arbitrary caller-controlled URL capability.

## 3. Research modes

NORMAL: SearXNG first; Decodo fallback.
PRECISION: Decodo Fast Search first; SearXNG fallback.
DEEP: baseline search, then Decodo Web Scraping for selected discovered sources.
CORROBORATION: query SearXNG and Decodo independently, then deduplicate before counting evidence sources.

Default inference: TOPIC_SCAN -> NORMAL; FACT_CHECK/TREND_SCAN/COMPETITOR_SCAN -> PRECISION. F00 may explicitly request a mode.

## 4. Cache boundary

Cache is consulted before provider calls.
Identity binds engine, query kind, rendered engine-owned query, declared parameters, freshness, and research mode.
Cache is an acquisition optimization, not a proof of truth.

## 5. Decodo budget boundary

Separate ledgers exist for:
- DECODO_FAST_SEARCH
- DECODO_WEB_STANDARD
- DECODO_WEB_JS
- DECODO_WEB_PREMIUM
- DECODO_WEB_PREMIUM_JS

A Decodo operation reserves quota before the network call, commits on completion, and releases on failure.
Vendor quotas are configuration, not hard-coded truth.

Before multi-instance production, the budget governor must be backed by a shared durable store so reservations remain atomic across workers.

## 6. Reliability boundary

Provider calls have bounded timeouts, bounded retry, exponential backoff, circuit breaking, health state, and fallback.
Provider failure must not become Reach failure.

## 7. Evidence/provenance

Each normalized source can retain provider, provider request ID, rendered query, URL, retrieval timestamp, extraction method, content hash, and status.
Provider output is candidate evidence only. F00 remains responsible for verification/corroboration.

## 8. Security boundary

Production Reach fails closed for missing or invalid Content Engine contracts, unauthorized caller floors, undeclared query kinds/parameters/templates, and arbitrary legacy AgentReach queries.

## 9. Configuration

SEARXNG_BASE_URL
DECODO_BASIC_AUTH
DECODO_FAST_SEARCH_URL
DECODO_WEB_API_URL
DECODO_WEB_PROXY_POOL
DECODO_WEB_HEADLESS
DECODO_FAST_SEARCH_BUDGET
DECODO_WEB_STANDARD_BUDGET
DECODO_WEB_JS_BUDGET
DECODO_WEB_PREMIUM_BUDGET
DECODO_WEB_PREMIUM_JS_BUDGET

Secrets must not be committed.

## 10. Implementation invariant

F00 owns research judgment; Reach owns information acquisition; SearXNG provides default discovery; Decodo provides quota-governed specialized acquisition; and no retrieval provider certifies truth.