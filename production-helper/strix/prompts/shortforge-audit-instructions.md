# SHORTFORGE / FACTORYOS SECURITY AUDIT INSTRUCTIONS

## Assessment Scope & Threat Model
Target Application: ShortForge / FactoryOS (Next.js Control Plane + FactoryOS Orchestration Kernel + Python Pipeline).
Clearance Context: Unauthenticated, BASIC Tier (Standard User), and ADMIN Tier.

## Key Target Areas & Invariants to Evaluate:
1. Multi-Tenant Horizontal Isolation:
   - Verify that BASIC User A cannot access, infer, or mutate User B's video jobs, missions, artifacts, or SSE state streams.
   - Test Firestore collection paths, query scoping, and `/api/factory-state` responses for BOLA/IDOR.

2. Vertical Privilege Escalation (RBAC):
   - Test whether BASIC users can execute administrative actions (e.g. bypassing quota limits, invoking admin endpoints, overriding execution policies).
   - Ensure role derivation is strictly server-authoritative (`verifySession` / `resolveTier`) and ignores client-provided `role` or `tier` fields.

3. BYOK & Provider Configuration Isolation:
   - Ensure individual user API keys, custom base URLs, and model settings are scoped per UID and never shared across users or stored in global singleton configurations.

4. Quota Abuse & Concurrency Invariants:
   - Test 5-video lifetime limit for BASIC tier.
   - Attack with parallel requests, double-clicks, and replay attacks.
   - Invariant: `completed <= 5`, `consumed <= 5`, `reserved + completed <= 5`.

5. Server-Side Request Forgery (SSRF):
   - Inspect all outbound HTTP dispatch points (`fetch`, `axios`, webhook callbacks).
   - Verify that untrusted client input cannot redirect render dispatch to internal network addresses (127.0.0.1, RFC1918, metadata IP 169.254.169.254).

6. Rendering Callback Forgery & Timing Attacks:
   - Verify `/api/rendering/callback` enforces constant-time cryptographic token comparison (`timingSafeEqual`) on `x-execution-token` / `Authorization`.
   - Ensure invalid or forged execution tokens are rejected with HTTP 401.

7. FactoryOS Bridge & Replay Protection:
   - Verify `PythonFloorBridge` validates cryptographic tuples `(userId, jobId, missionId, floorId, executionId, attempt, executionToken)` and rejects replayed nonces.
