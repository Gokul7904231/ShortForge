# Safety / Document Provider Fabric

Status: CONTRACT-GATED

## Implemented providers
- OCR.Space: POST /parse/image, server-side API-key header, URL/base64 request forms, typed OCR result normalization.
- Google Safe Browsing: threatMatches.find with explicit threat types/platforms. The integration is explicitly gated to the API's non-commercial usage boundary; commercial deployments must use an appropriate commercial threat-detection product instead.
- urlscan.io: asynchronous POST /api/v1/scan + GET /api/v1/result/{scanId}/ with default private visibility and bounded polling.

## Not implemented
- Perspective API remains CATALOGUED pending current official endpoint/authentication verification. No guessed endpoint is committed.

## Privacy / security
- Only http/https URLs are accepted; embedded URL credentials are rejected.
- Provider response bodies are not copied wholesale into logs or evidence.
- urlscan defaults to private visibility so user-controlled/private URLs are not published by default.
- Secrets remain server-only.

## Authority
These providers are advisory safety/document inputs. They do not decide F00 truth, Guardian policy, Treasury admission, ComputeRouter placement, F06 execution, CAS identity or F07 release verification.

## Verification
Deterministic tests verify transport and normalization contracts. IMPLEMENTED is not QUALIFIED; live qualification requires provider-specific network proof and must honor provider terms.
