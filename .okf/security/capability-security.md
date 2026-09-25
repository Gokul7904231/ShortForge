# Security: Capability-Based Security & Fine-Grained Permissions

> **Status**: OPERATIONAL / CANONICAL  
> **Source Location**: `apps/web/factoryos/core/agent/AgentRuntimeContracts.ts` & `apps/web/factoryos/core/cognitive/CapabilityRegistry.ts`

---

## 1. Architectural Philosophy: Granular Capability Grants

In traditional multi-agent systems, agents are given broad access to a tool suite, trusting that the agent's system prompt will prevent it from calling destructive tools (e.g. deleting files, reading environment variables, or accessing payment endpoints). This reliance on "prompt hygiene" is notoriously vulnerable to prompt injection and agent hallucinations.

FactoryOS implements a **Capability-Based Security Model**. Agents and workers do not inherit ambient permissions. Instead, each agent session must be explicitly granted discrete capability tokens:
- Without `CAP_NET_READ`, an agent cannot invoke web scrapers or HTTP clients.
- Without `CAP_FS_WRITE`, an agent cannot write files outside its ephemeral sandbox.
- Without `CAP_RENDER_DISPATCH`, an agent cannot trigger GPU encoding jobs.

```
┌────────────────────────────────────────────────────────┐
│                     Agent Session                      │
│        grantedCapabilities: ["CAP_SCRIPT_WRITING"]     │
└───────────────────────────┬────────────────────────────┘
                            │ Requests Execution of Skill
                            ▼
┌────────────────────────────────────────────────────────┐
│                   Guardian Capability Gate             │
│  ├── Skill: "format_script_beats"                      │
│  │   requiredCapabilities: ["CAP_SCRIPT_WRITING"] ──► PASS
│  │                                                     │
│  └── Skill: "fetch_external_url"                       │
│      requiredCapabilities: ["CAP_NET_READ"] ────────► REJECT
└────────────────────────────────────────────────────────┘
```

---

## 2. CURRENT vs TARGET Architecture Status

| Architectural Dimension | CURRENT Implementation | TARGET Implementation |
|:------------------------|:-----------------------|:----------------------|
| **Capability Enforcement** | Pre-execution verification in `AgentRuntime.ts` | Linux seccomp / AppArmor kernel-level capability restriction |
| **Grant Granularity** | 12 discrete capability tokens across production floors | Hierarchical capability graphs with parameter-level constraints (e.g. read-only to path prefix) |
| **Token Delegation** | Parent agents can only delegate a subset of their granted capabilities | Cryptographic Macaroons with append-only attenuation and third-party discharge caveats |
| **Audit Logging** | Security violation events dispatched to `DurableEventBus` | Real-time SIEM event streaming with automated incident case opening |

---

## 3. Canonical Floor Capability Matrix

| Floor | Canonical Floor ID | Default Granted Capabilities | Strictly Forbidden Capabilities |
|:------|:-------------------|:-----------------------------|:--------------------------------|
| **F00** | `FLOOR_00_ANALYST` | `CAP_NET_READ`, `CAP_RESEARCH_EXEC` | `CAP_FS_WRITE`, `CAP_RENDER_DISPATCH`, `CAP_DELIVERY_PUBLISH` |
| **F01** | `FLOOR_01_STRATEGY` | `CAP_STRATEGY_SYNTHESIS` | `CAP_NET_READ`, `CAP_FS_WRITE`, `CAP_RENDER_DISPATCH` |
| **F02** | `FLOOR_02_SCRIPTING` | `CAP_SCRIPT_WRITING` | `CAP_NET_READ`, `CAP_AUDIO_ENCODE`, `CAP_RENDER_DISPATCH` |
| **F03** | `FLOOR_03_ASSET_REALIZATION` | `CAP_ASSET_INGEST`, `CAP_VECTOR_SEARCH` | `CAP_SCRIPT_WRITING`, `CAP_DELIVERY_PUBLISH` |
| **F04** | `FLOOR_04_MEDIA_SYNTHESIS` | `CAP_VOICE_SYNTHESIS`, `CAP_AUDIO_ENCODE` | `CAP_NET_WRITE`, `CAP_TIMELINE_COMPILE` |
| **F05** | `FLOOR_05_TIMELINE_COMPOSITION`| `CAP_TIMELINE_COMPILE` | `CAP_NET_READ`, `CAP_RENDER_DISPATCH` |
| **F06** | `FLOOR_06_RENDERING` | `CAP_RENDER_DISPATCH`, `CAP_FS_WRITE` | `CAP_NET_WRITE`, `CAP_SCRIPT_WRITING` |
| **F07** | `FLOOR_07_QA_COMPLIANCE` | `CAP_QA_INSPECT`, `CAP_EVAL_EXEC` | `CAP_FS_WRITE`, `CAP_DELIVERY_PUBLISH` |

---

## 4. Principle of Attenuation

When an agent spawns a child subagent:
$$\text{childCapabilities} \subseteq \text{parentCapabilities}$$
A parent agent can never grant capabilities it does not possess. Attempting to escalate privileges triggers an immediate `SECURITY_VIOLATION` event, halts the session, and notifies the Slayer.


## 5. Detailed worker permission contract

The root canonical worker permission map is .okf/security/worker-permissions.md.

That file expands this capability matrix into worker lifecycle rules, skill gates, lease/fencing requirements, production-helper boundaries, test requirements, and absolute worker prohibitions.


## 5. Canonical Worker Permission Contract

The detailed worker permission and denial model is maintained in `.okf/security/worker-permissions.md`. This file defines the high-level capability-security principle; the worker-permissions document defines exact worker scope, denial semantics, delegation, resource boundaries, lease/fencing requirements, and verification rules.