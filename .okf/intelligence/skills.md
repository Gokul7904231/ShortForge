# Intelligence: Typed Skills Architecture & Catalog

> **Status**: OPERATIONAL / CANONICAL  
> **Source Location**: `apps/web/factoryos/core/agent/AgentRuntimeContracts.ts` & `apps/web/factoryos/core/agent/AgentRuntime.ts`

---

## 1. Architectural Philosophy: Typed Skills as Sandboxed Capabilities

In FactoryOS, autonomous agents do not execute arbitrary shell commands or untyped API calls. Instead, all specialized agency is factored into discrete, strongly-typed **Skills**. A Skill represents a verifiable, deterministic or bounded-generative tool invocation governed by capability grants and resource boundaries.

Skills decouple high-level agent reasoning from low-level operational execution. When an agent decides to perform a domain action (such as extracting audio spectral features, rendering a clip segment, or querying source evidence), it requests the execution of a registered Skill through the `AgentRuntime`.

```
┌────────────────────────────────────────────────────────┐
│                      Agent Session                     │
│         (Context Buffer, History, Current Plan)        │
└───────────────────────────┬────────────────────────────┘
                            │ Skill Invocation Request
                            ▼
┌────────────────────────────────────────────────────────┐
│                   AgentRuntime Engine                  │
│  ├── Capability Validation (Guardian Gate)             │
│  ├── Budget & Token Guard                              │
│  └── Trace Context Attachment                          │
└───────────────────────────┬────────────────────────────┘
                            │ Authorized Execution
                            ▼
┌────────────────────────────────────────────────────────┐
│                    Registered Skill                    │
│    (Typed Input -> Deterministic / API Work -> Output) │
└────────────────────────────────────────────────────────┘
```

---

## 2. CURRENT vs TARGET Architecture Status

| Architectural Dimension | CURRENT Implementation | TARGET Implementation |
|:------------------------|:-----------------------|:----------------------|
| **Skill Registration** | Explicit typed catalog in `AgentRuntimeContracts.ts` | Dynamic discovery via signed plugin descriptors with hot-reload |
| **Capability Enforcement** | Pre-execution capability check against agent session grants | Cryptographically signed capability tokens per sub-invocation |
| **Execution Sandboxing** | In-process execution with timeout, memory, and abort signal controls | Isolated WebAssembly / container micro-runtimes for untrusted tools |
| **Trace Context Propagation** | Distributed trace injection (`traceId`, `spanId`, parent linkage) | OpenTelemetry export with automated latency and cost attribution |
| **Skill Output Lineage** | Output captured in `AgentCheckpoint` with artifact hashes | Automatic CAS persistence for all intermediate skill blobs |

---

## 3. Skill Definition Contract

Every skill conforms to the standard specification contract defined in `AgentRuntimeContracts.ts`:

```typescript
export interface AgentSkillDefinition<TInput = unknown, TOutput = unknown> {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly requiredCapabilities: readonly string[];
  readonly inputSchema: Record<string, unknown>;
  readonly outputSchema: Record<string, unknown>;
  readonly timeoutMs: number;
  execute(input: TInput, context: AgentSkillExecutionContext): Promise<TOutput>;
}

export interface AgentSkillExecutionContext {
  readonly sessionId: string;
  readonly agentId: string;
  readonly traceContext: TraceContext;
  readonly signal: AbortSignal;
  log(level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR', message: string, data?: unknown): void;
}
```

### Core Execution Guarantees
1. **Capability Gate**: Before `execute()` is called, `AgentRuntime` verifies that `session.grantedCapabilities` contains every item in `skill.requiredCapabilities`. If missing, the runtime throws a `SECURITY_VIOLATION` finding.
2. **Cancellation Propagation**: If the mission or task is aborted by Slayer or Overseer, the `AbortSignal` fires immediately to release network connections and compute tasks.
3. **Execution Isolation**: Uncaught exceptions inside a skill are caught by `AgentRuntime`, wrapped into structured error records, and prevented from crashing the host process.

---

## 4. Canonical Floor Skill Mapping

Skills are organized by production floor responsibility:

| Floor | Canonical Floor ID | Representative Skills | Required Capabilities |
|:------|:-------------------|:----------------------|:----------------------|
| **F00** | `FLOOR_00_ANALYST` | `fetch_market_signals`, `analyze_topic_saturation`, `synthesize_slate` | `CAP_NET_READ`, `CAP_RESEARCH_EXEC` |
| **F01** | `FLOOR_01_STRATEGY` | `build_editorial_blueprint`, `evaluate_persona_fit`, `calculate_hook_variance` | `CAP_STRATEGY_SYNTHESIS` |
| **F02** | `FLOOR_02_SCRIPTING` | `generate_beat_sheet`, `score_retention_curve`, `format_dialogue_timing` | `CAP_SCRIPT_WRITING` |
| **F03** | `FLOOR_03_ASSET_REALIZATION` | `query_vector_store`, `ingest_broll_metadata`, `synthesize_visual_prompts` | `CAP_ASSET_INGEST`, `CAP_VECTOR_SEARCH` |
| **F04** | `FLOOR_04_MEDIA_SYNTHESIS` | `route_voice_synthesis`, `generate_speech_audio`, `extract_audio_duration` | `CAP_VOICE_SYNTHESIS`, `CAP_AUDIO_ENCODE` |
| **F05** | `FLOOR_05_TIMELINE_COMPOSITION`| `compile_timeline_ir`, `reconcile_track_collision`, `position_captions` | `CAP_TIMELINE_COMPILE` |
| **F06** | `FLOOR_06_RENDERING` | `dispatch_render_job`, `poll_worker_status`, `verify_mp4_integrity` | `CAP_RENDER_DISPATCH`, `CAP_FS_WRITE` |
| **F07** | `FLOOR_07_QA_COMPLIANCE` | `inspect_video_artifacts`, `evaluate_compliance_rules`, `publish_findings` | `CAP_QA_INSPECT`, `CAP_EVAL_EXEC` |

---

## 5. Verification & Safety Controls

1. **Pre-Conditions**: Skills must validate their input payloads against schema before processing. Invalid payloads return immediate schema rejection without invoking downstream APIs.
2. **Post-Conditions**: Output payloads must produce verifiable artifacts or structured outputs.
3. **Idempotency**: Skills marked as read-only or query operations are declared idempotent; mutating skills record their resulting changes in the mission context ledger.
