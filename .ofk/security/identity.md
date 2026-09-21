# Security: Identity & RBAC Policy

> **Status**: OPERATIONAL  
> **Source Module**: `apps/web/lib/auth/`  

---

## 1. Identity Verification & Session Integrity
- **Production Mode**: Strictly enforces Firebase Admin session cookie verification (`verifySessionCookie(sessionCookie, true)` with revocation check).
- **Non-Production Mode**: Allows mock session cookies (`mock_session_cookie_*`) exclusively when `NODE_ENV !== "production"`.
- **Role Hierarchy**:
  - `USER`: Read-only access to own jobs and profile.
  - `CREATOR`: Can initiate generation missions and download assets.
  - `ADMIN`: Full access to floor controls, worker pools, diagnostic logs, and case management.
  - `SYSTEM`: Automated internal workers holding cryptographic tokens.
