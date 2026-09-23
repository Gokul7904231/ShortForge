# Intelligence: Capability-First Model Routing & Provider Governance

> **Status**: OPERATIONAL / CANONICAL  
> **Source Location**: `apps/web/factoryos/core/routing/ModelRoutingContracts.ts` & `apps/web/factoryos/core/cognitive/`

---

## 1. Architectural Philosophy: Capability-First Routing

In FactoryOS, autonomous agents never bind directly to vendor-specific model strings (e.g., `gpt-4o`, `claude-3-5-sonnet`, `gemini-1.5-pro`). Direct vendor coupling creates brittle failure modes, vendor lock-in, unmonitored cost blowouts, and breaks deterministic evaluation.

Instead, FactoryOS implements **Capability-First Model Routing**. Agents declare their semantic requirement profile (e.g., structured JSON extraction, deep reasoning, low latency, multimodal image inspection, or long-context comprehension). The Router dynamically evaluates candidate models against:
1. **Capability Alignment**: Does the provider support the required task features?
2. **Provider Health & Circuit State**: Is the provider currently healthy (`CLOSED`), failing (`OPEN`), or canary testing (`HALF_OPEN`)?
3. **Budget & Cost Profile**: Does the selection fit within the allocated token and financial budget?
4. **Latency Requirements**: Does the task have real-time requirements (e.g., Floor 04 stream synthesis) or batch tolerance (e.g., Floor 00 deep analysis)?

```
┌────────────────────────────────────────────────────────┐
│                   Agent Execution Plan                 │
│      Requests: { capability: REASONING, json: true }   │
└───────────────────────────┬────────────────────────────┘
                            │ Routing Request
                            ▼
┌────────────────────────────────────────────────────────┐
│                  Dynamic Model Router                  │
│  ├── Filter: Capability Match                          │
│  ├── Filter: Circuit Breaker State (exclude OPEN)      │
│  ├── Rank: Latency & Cost Optimization                 │
│  └── Select Primary + Ordered Fallback Chain           │
└───────────────────────────┬────────────────────────────┘
                            │ Selected Provider Dispatch
                            ▼
┌───────────────────┬───────────────────┬────────────────┐
│   Primary LLM     │  Secondary LLM    │ Rule/Mock Fall │
│  (e.g., Gemini)   │  (e.g., Claude)   │  (Clean-Room)  │
└───────────────────┴───────────────────┴────────────────┘
```

---

## 2. CURRENT vs TARGET Architecture Status

| Architectural Dimension | CURRENT Implementation | TARGET Implementation |
|:------------------------|:-----------------------|:----------------------|
| **Routing Paradigm** | Strongly typed capability contracts in `ModelRoutingContracts.ts` | Multi-armed bandit / reinforcement-learned routing based on benchmark scoring |
| **Circuit Breakers** | Tri-state breaker per provider (`CLOSED`, `OPEN`, `HALF_OPEN`) | Adaptive rate-limit backpressure with jittered exponential backoff |
| **Provider Fallback** | Deterministic ordered fallback chain defined per capability tier | Real-time multi-region load shedding across distributed provider endpoints |
| **Token Cost Attribution** | Trace-linked token counting in `AgentRuntime` checkpoints | Per-mission ledger with hard stop limits and automated billing alerting |
| **Local / Offline Fallback**| Deterministic mock and rule engine for hermetic test execution | Local quantized model serving (Ollama / vLLM) in air-gapped environments |

---

## 3. Core Routing Contracts

Defined in `ModelRoutingContracts.ts`:

```typescript
export type ModelCapability = 
  | 'STRUCTURED_JSON'
  | 'REASONING_PLANNING'
  | 'FAST_SYNTHESIS'
  | 'MULTIMODAL_VISION'
  | 'AUDIO_SYNTHESIS'
  | 'LONG_CONTEXT';

export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface ModelProviderDescriptor {
  readonly id: string;
  readonly name: string;
  readonly supportedCapabilities: readonly ModelCapability[];
  readonly costPer1kInputTokens: number;
  readonly costPer1kOutputTokens: number;
  readonly averageLatencyMs: number;
  readonly isAvailable: boolean;
  readonly circuitState: CircuitBreakerState;
}

export interface ModelRouteRequest {
  readonly requiredCapabilities: readonly ModelCapability[];
  readonly maxLatencyMs?: number;
  readonly preferredProviderId?: string;
  readonly fallbackChain: readonly string[];
}
```

---

## 4. Circuit Breaker Lifecycle

To protect production stability from upstream AI provider degradation:

1. **CLOSED (Normal Operation)**:
   - All requests route to the primary selected provider.
   - Successes reset error counters.
   - If consecutive errors exceed `FAILURE_THRESHOLD` (default: 5) or error rate exceeds 30% in a 60-second window, circuit transitions to **OPEN**.
2. **OPEN (Provider Tripped)**:
   - All incoming requests instantly bypass the provider and select the next provider in `fallbackChain`.
   - No calls are sent to the tripped provider during `COOLDOWN_PERIOD` (default: 30 seconds).
   - Once cooldown expires, circuit transitions to **HALF_OPEN**.
3. **HALF_OPEN (Probe / Canary)**:
   - A small fraction (e.g., 10%) of requests are routed to the provider as canary probes.
   - If canary calls succeed, circuit resets to **CLOSED**.
   - If a canary call fails, circuit trips back to **OPEN** with an exponentially doubled cooldown.

---

## 5. Verification & Testing

The model routing subsystem is verified via automated tests:
- `apps/web/factoryos/tests/modernization/architecture-modernization.test.ts`:
  - `Model routing selects provider based on required capabilities`: Validates that requests requiring `REASONING_PLANNING` or `STRUCTURED_JSON` match appropriate providers and exclude incapable or tripped providers.
  - Fallback propagation when primary provider circuit is tripped.
