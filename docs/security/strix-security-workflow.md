# FactoryOS Strix Security Assessment & CI Workflow

## Overview
This document specifies how to execute Strix security assessments against the FactoryOS application in development environments and automated CI/CD pipelines.

---

## 1. Prerequisites
- **Docker Engine**: Installed and running daemon.
- **Python 3.10+ / Node.js 20+**
- **Target Environment**: Local FactoryOS server (e.g. `http://localhost:3001` or local source repository).
- **Security Scope**: FactoryOS internal code and localhost environment only. Never point Strix at unauthorized external domains.

---

## 2. Running Local Strix Assessments

### A. Static Codebase Assessment
```bash
# Scan FactoryOS source code for authentication, authorization, and cryptographic weaknesses
strix --target ./gen-v --mode whitebox --focus auth,rbac,crypto,session
```

### B. Live Web Application Assessment
Start the local FactoryOS production server:
```bash
cd gen-v
npm run build
npm run start -- -p 3001
```

Run Strix with dedicated test account credentials:
```bash
strix --target http://localhost:3001 \
  --mode focused \
  --instructions "Test authentication bypass, OTP brute-force, password reset race conditions, server-side RBAC on /api/admin/users, and session cookie security flags." \
  --test-user "basic_test_user@example.com:Password123!" \
  --admin-user "admin_test_user@example.com:AdminPassword123!"
```

---

## 3. Scope & Coverage Checklist
- [x] **Authentication Bypass**: Verify fail-closed 401 on unauthenticated `/api/*` requests.
- [x] **Privilege Escalation**: Verify 403 Forbidden for `USER` role attempting to access `/api/admin/users` or mutate system configurations.
- [x] **OTP Brute-Force**: Verify 5-attempt limit and lockout on `/api/auth/verify-reset-code`.
- [x] **Password Reset Single-Use**: Verify immediate invalidation of OTP and reset authorization tokens upon use.
- [x] **Email Enumeration**: Verify constant-time generic responses on `/api/auth/forgot-password`.
- [x] **Credential Storage**: Zero plaintext passwords, OTPs, or reset tokens in database.

---

## 4. GitHub Actions CI Configuration
The non-interactive workflow is configured in `.github/workflows/security-strix.yml` to run on Pull Requests modifying `gen-v/lib/auth/**` or `gen-v/app/api/auth/**`.
