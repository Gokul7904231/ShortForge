# 🏠 Bring Your Own Local Model (BYOLM) Architecture — FactoryOS v1

**Role:** Lead Architect & AI Infrastructure Engineer  
**Specification:** Architecture, provider abstractions, model discovery, connection persistence, security rules, and telemetry for local AI model runtimes (Ollama, LM Studio, OpenAI-compatible).

---

## 1. 🏗️ Local AI Abstraction Model

FactoryOS decouples application logic from specific local runtimes through the `LocalAIManagerPlugin` abstraction (`gen-v/ai/providers/local-ai-manager.ts`):

```typescript
export interface LocalAIConnection {
  id: string;
  name: string;
  type: "ollama" | "lmstudio" | "openai-compatible";
  endpoint: string;
  status: "connected" | "offline" | "timeout" | "unauthorized" | "model_unavailable" | "unknown";
  models: ModelMeta[];
  selectedModel?: string;
  lastCheckedAt?: string;
}
```

---

## 2. 🔍 Dynamic Model Discovery & Connection Testing

### Ollama Model Discovery Protocol:
- **Endpoint**: `GET {baseUrl}/api/tags`
- **Output Mapping**: Parses installed models into `ModelMeta` objects with `isLocal: true`, `costInput: 0`, `costOutput: 0`.

### Connection Verification Sequence:
1. Validate endpoint URL structure & SSRF safety rules.
2. Issue HTTP `GET` to runtime model list endpoint with a strict 3000ms timeout.
3. Verify specified model exists in runtime inventory.
4. Execute lightweight test completion.
5. Transition connection state to `CONNECTED`, `OFFLINE`, `TIMEOUT`, or `MODEL_UNAVAILABLE`.

---

## 3. 🛡️ Security & Provenance Enforcement

- **Truth & Provenance**: Local inference telemetry records `executionMode: "local"`, `estimatedCostUsd: null`, and actual token usage if provided by the local runtime.
- **SSRF Prevention**: Endpoint validation blocks requests to cloud metadata IPs (`169.254.169.254`).
- **RBAC**: Saving user-level local connections requires authenticated Firebase admin session.
