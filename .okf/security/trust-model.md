# Security: Zero-Trust Perimeter & Invariant Enforcement

> **Status**: OPERATIONAL / CANONICAL  
> **Source Location**: `apps/web/factoryos/core/guardian/` & `apps/web/lib/auth/`

---

## 1. Architectural Philosophy: The Zero-Trust Perimeter

In autonomous generative pipelines that ingest arbitrary web content, execute external LLM completions, and interact with distributed compute workers, traditional perimeter security is completely insufficient. A malicious payload embedded in a scraped web page or an unexpected hallucination from a model can lead to prompt injection, SSRF, data exfiltration, or resource exhaustion.

FactoryOS implements a **Zero-Trust Architecture** based on four core guarantees:
1. **No External Bypasses**: All inbound generation requests and administrative commands pass through authenticated API gateways (`POST /api/generate-video` or `POST /api/overseer/command`) with cryptographically verified session headers.
2. **Timing-Safe Callbacks**: Distributed worker callbacks are verified using constant-time comparisons (`crypto.timingSafeEqual`) over execution tokens, preventing timing attack side-channels.
3. **Fencing Token Invariant**: Every callback and artifact submission must present a valid, monotonically increasing fencing token matching an active lease. Stale or duplicate callbacks are discarded.
4. **Input Sanitization & Schema Isolation**: External inputs (topics, URLs, prompts) are validated via strict Zod schemas before being passed across floor boundaries.

```
┌────────────────────────────────────────────────────────┐
│                   External Request                     │
│               (User API / Webhook Call)                │
└───────────────────────────┬────────────────────────────┘
                            │ Authenticate Session Cookie
                            ▼
┌────────────────────────────────────────────────────────┐
│                   API Gateway Perimeter                │
│  ├── Validate Session (Revocation Check Enabled)       │
│  ├── Schema Validation (Zod Type Invariants)           │
│  └── Quota & Tier Check (Rate Limiting)                │
└───────────────────────────┬────────────────────────────┘
                            │ Authorized Dispatch
                            ▼
┌────────────────────────────────────────────────────────┐
│                  Overseer Control Plane                │
│             (Instantiates Isolated Mission)            │
└───────────────────────────┬────────────────────────────┘
                            │ Task Dispatch with Fencing Token
                            ▼
┌────────────────────────────────────────────────────────┐
│              Distributed Compute / Worker Node         │
│  ├── Sandboxed Execution                               │
│  ├── Signed HMAC Callback: Token + Digest              │
│  └── Timing-Safe Equal Verification                    │
└────────────────────────────────────────────────────────┘
```

---

## 2. CURRENT vs TARGET Architecture Status

| Architectural Dimension | CURRENT Implementation | TARGET Implementation |
|:------------------------|:-----------------------|:----------------------|
| **Callback Verification**| Constant-time token comparison with HMAC signatures | mTLS (mutual TLS) with ephemeral SPIFFE/SPIRE x509 certificates |
| **Worker Isolation** | Process sandboxing and ephemeral scratch directories | Hypervisor-isolated microVMs (Firecracker) with read-only root filesystems |
| **Fencing & Leases** | Monotonically increasing integer tokens in lease manager | Linearizable Paxos/Raft consensus fencing tokens |
| **Prompt Injection Defense**| Strict delimiter quoting and schema output validation | Dual-LLM intent-guard architecture isolating untrusted text from instructions |

---

## 3. Cryptographic Invariants

- **Timing-Safe Comparison**: `crypto.timingSafeEqual(Buffer.from(receivedToken), Buffer.from(expectedToken))` prevents length and byte-by-byte timing attacks.
- **Digest Verification**: When an external worker returns an artifact, the master orchestrator recalculates `sha256(artifactBytes)` and compares it against the reported digest before registering the artifact in the CAS.
