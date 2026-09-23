# Security: Identity, Authentication & Role-Based Access Control

> **Status**: OPERATIONAL / CANONICAL  
> **Source Location**: `apps/web/lib/auth/` & `apps/web/factoryos/core/agent/`

---

## 1. Architectural Philosophy: Cryptographic Identity for Humans & Autonomous Agents

In an autonomous production environment where human creators, automated scheduled missions, background maintenance agents, and external rendering workers interact, identity must be rigorous, cryptographically verifiable, and non-forgeable.

FactoryOS implements a unified identity model across both human operators and autonomous agents:
1. **Human Authentication**: Session cookie verification with active revocation checking (`verifySessionCookie(cookie, true)`).
2. **Autonomous Agent Identity**: Every agent session is initialized with an authenticated `agentId` and an immutable cryptographic public key / signature token.
3. **Role-Based Access Control (RBAC)**: Fine-grained permissions governing what actions human operators and automated roles can perform.

```
┌────────────────────────────────────────────────────────┐
│                   Incoming Principal                   │
├───────────────────────────┬────────────────────────────┤
│   Human Operator (Cookie) │ Autonomous Agent (Token)   │
└─────────────┬─────────────┴─────────────┬──────────────┘
              │                           │
              ▼ Auth & Revocation Check   ▼ Cryptographic Verification
┌────────────────────────────────────────────────────────┐
│                  Authentication Gateway                │
│  ├── Validate Signature / Session Expiry               │
│  ├── Check Revocation Ledger                           │
│  └── Resolve Effective Principal Role                  │
└───────────────────────────┬────────────────────────────┘
                            │ Authorized Role
                            ▼
┌──────────────┬──────────────┬──────────────┬───────────┐
│     USER     │   CREATOR    │    ADMIN     │  SYSTEM   │
│  (Read-Only) │  (Production │  (Cluster &  │ (Internal │
│              │   Missions)  │   Forensics) │  Workers) │
└──────────────┴──────────────┴──────────────┴───────────┘
```

---

## 2. CURRENT vs TARGET Architecture Status

| Architectural Dimension | CURRENT Implementation | TARGET Implementation |
|:------------------------|:-----------------------|:----------------------|
| **Human Auth** | Firebase Admin session cookies with revocation checks | WebAuthn / Passkeys + multi-factor authentication (MFA) |
| **Agent Identity** | In-memory unique agent IDs with trace correlation | SPIFFE/SPIRE cryptographic workload identities with automated SVID rotation |
| **RBAC Enforcement** | Route-level middleware and role validation helpers | Fine-grained Attribute-Based Access Control (ABAC) using Open Policy Agent (OPA) |
| **Audit Non-Repudiation**| Decision ledger with user ID and trace tagging | Cryptographic Merkle tree append-only signature ledger |

---

## 3. Role Hierarchy & Operational Permissions

| Role | Intended Entity | Permitted Actions | Restricted Actions |
|:-----|:----------------|:------------------|:-------------------|
| `USER` | Free / Basic Consumer | View own generation history, preview low-res video, download assets | Launch batch schedules, alter floor parameters, view cluster health |
| `CREATOR` | Pro / Enterprise Creator | Launch generation missions, configure channel schedules, select voice models | Mutate cluster infrastructure, access raw secrets |
| `ADMIN` | Factory Operator / Engineer | Trigger Slayer sweeps, manual Healer actions, override floor DAG, inspect cases | None |
| `SYSTEM` | Internal Floor Specialists | Process leased tasks, emit artifacts, send heartbeats | Mutate global billing records or user accounts |
