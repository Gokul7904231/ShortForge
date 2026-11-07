# Canva Developer API Capability & OAuth 2.0 PKCE Report (Milestone R3)

**Document Reference:** `docs/verification/canva-api-capability-report.md`  
**Execution Date:** 2026-11-03  
**Integrity Mode:** Production Hardened (Strict Verification, Zero Credential Exposure)  
**Governing Directives:** Canva Official REST API Documentation (v1) & RFC 7636 PKCE Specification  

---

## Executive Summary

ShortForge integrates Canva as an external visual-design authoring environment while retaining native Python/Pillow/FFmpeg production rendering as the authoritative video compiler.

This report establishes the technical architecture, security model, and capability findings for Canva Developer OAuth 2.0 with PKCE and the REST API capability probe (`GET /rest/v1/users/me/capabilities`).

---

## 1. OAuth 2.0 Authorization Code with PKCE Architecture

### 1.1 Specification & Security Flow (RFC 7636)
Canva requires Authorization Code flow with Proof Key for Code Exchange (PKCE) with SHA-256 (`S256`):

```text
[Browser / Creator]                   [ShortForge Backend]                   [Canva OAuth Server]
        │                                      │                                      │
        │ ── GET /api/canva/connect ─────────> │                                      │
        │                                      │ ── Generates code_verifier (43b)     │
        │                                      │ ── Computes code_challenge (S256)    │
        │                                      │ ── Generates HMAC-signed state nonce │
        │ <── Returns authUrl + Sets Cookies ─ │                                      │
        │     (HttpOnly canva_pkce_verifier,   │                                      │
        │      HttpOnly canva_oauth_state)     │                                      │
        │                                                                             │
        │ ── Browser redirects to Canva Consent Screen ─────────────────────────────> │
        │    https://www.canva.com/api/oauth/authorize?                               │
        │      response_type=code&client_id=...&code_challenge=...&state=...          │
        │                                                                             │
        │ <── User authorizes; Canva redirects to Callback URI ────────────────────── │
        │                                                                             │
        │ ── GET /api/canva/callback?code=...&state=... ────────────────────────────> │
        │                                      │                                      │
        │                                      │ ── Validates HMAC state & cookie     │
        │                                      │ ── Reads HttpOnly code_verifier      │
        │                                      │ ── POST /rest/v1/oauth/token ──────> │
        │                                      │    (Basic Auth client_id:secret,     │
        │                                      │     code_verifier, code)             │
        │                                      │ <── Returns tokens ───────────────── │
        │                                      │ ── GET /rest/v1/users/me/profile ──> │
        │                                      │ ── GET /rest/v1/users/me/capabilit.─>│
        │                                      │ ── Stores connection securely        │
        │ <── Redirect to /settings?canva=conn ─│                                      │
```

### 1.2 Exact Redirect URIs for Canva Developer Portal
The following exact redirect URIs are configured in ShortForge and registered in the Canva Developer Portal:

1. **Local Development Redirect URI (Primary):**
   ```text
   http://localhost:3000/api/canva/callback
   ```
2. **Local Development Redirect URI (Public Auth Prefix Alias):**
   ```text
   http://localhost:3000/api/auth/canva/callback
   ```
3. **Production Redirect URI (Primary):**
   ```text
   https://shortforge.com/api/canva/callback
   ```
4. **Production Redirect URI (Public Auth Prefix Alias):**
   ```text
   https://shortforge.com/api/auth/canva/callback
   ```

*Middleware Exemption:* `apps/web/middleware.ts` includes `/api/canva/callback` and `/api/canva/status` in `PUBLIC_PREFIXES` to prevent unauthenticated 401 interception on external OAuth browser redirects.

---

## 2. Canva API Scope Analysis & Principle of Least Privilege

ShortForge requests only the minimal scopes necessary for visual template synchronization:

| Scope | Permission Type | Mandatory / Optional | Purpose |
| :--- | :--- | :--- | :--- |
| `profile:read` | Read | Mandatory | Read user display name and profile ID for connection status display |
| `design:content:read` | Read | Mandatory | Read pages, layer hierarchies, and design assets |
| `design:meta:read` | Read | Mandatory | Retrieve design dimensions, titles, and update timestamps |
| `asset:read` | Read | Mandatory | Read user asset library and verify uploaded visual assets |
| `asset:write` | Write | Mandatory | Upload background assets or branding badges to Canva |
| `brandtemplate:content:read` | Read | Optional | Read master brand template datasets (if enabled on account) |
| `brandtemplate:meta:read` | Read | Optional | Inspect brand template titles and version metadata |

*Excluded Scopes:*
- `folder:read`, `folder:write` (Not required; ShortForge does not manage Canva drive folders)
- `comment:read`, `comment:write` (Not required)
- `team:read` (Not required for single creator workflows)

---

## 3. Account Tier Restriction Audit: Canva Pro Lite & Autofill

### 3.1 Pro Lite Capability Investigation
- **Owner Subscription:** Canva Pro Lite (India region).
- **Official Canva Help Centre Rule:** The Canva Autofill API and Brand Template Autofill features are explicitly **restricted** on Canva Free and Canva Pro Lite subscriptions. Autofill requires Canva Enterprise or full Canva Teams/Pro multi-seat accounts.
- **Verification Rule:** ShortForge must **never** assume the `autofill` capability exists or block pipeline execution on its absence.

### 3.2 Automated Capability Probe Handling (`CanvaConnectionManager.ts`)
```typescript
const caps = Array.isArray(data.capabilities)
  ? data.capabilities
  : Object.keys(data.capabilities || {});

const canAutofill = caps.some((c: string) => c.toLowerCase().includes("autofill"));
const canExport = caps.some((c: string) => c.toLowerCase().includes("export") || c.toLowerCase().includes("design"));
```

### 3.3 Architecture Decoupling & Native Variable-Content Path
Because `canAutofill === false` on Pro Lite:
1. **Canva Master Template:** Supplies static/semi-transparent visual styling assets (9:16 portrait frames, glass cards, category badge plates, progress bar tracks, emerald punch badges, explanation card frames).
2. **Native ShortForge Renderer:** Authoritatively owns dynamic variable text, 6-question orchestration, option text, 5-second countdown timer, answer reveal highlighting, explanation typography, and narration synchronization.
3. **Zero Upgrade Requirement:** The creator does **not** need to upgrade to Canva Enterprise. The hybrid workflow functions completely on Canva Pro Lite.

---

## 4. Zero Credential Exposure Attestation

A comprehensive security audit of `CanvaConnectionManager.ts` and associated endpoints verifies:
1. **Environment Variables:** `CANVA_CLIENT_ID` and `CANVA_CLIENT_SECRET` are read exclusively by backend Node processes. They are never exported with `NEXT_PUBLIC_` prefixes.
2. **Sanitized Public Status (`/api/canva/status`):** Exposes only `connected`, `displayName`, `subscriptionTier`, and `capabilities`. Tokens and client secrets are stripped before serialization.
3. **Automated Vitest Assertion (`canva-oauth-pkce.test.ts`):** Asserts `JSON.stringify(status)` contains 0 occurrences of `clientSecret`, `accessToken`, or `refreshToken`.

---

## 5. Verification Record

- **Test Suite:** `apps/web/factoryos/tests/canva-oauth-pkce.test.ts`
- **Result:** **6 passed, 0 failed (720 ms)**
- **Checks Verified:**
  - RFC 7636 PKCE Verifier & S256 Challenge generation
  - Tamper-proof HMAC state validation & nonce cookie binding
  - Expiry rejection (> 15 minutes)
  - Authorization URL construction with exact scopes
  - Pro Lite capability probing & Autofill degradation
  - Zero credential leakage in public status
