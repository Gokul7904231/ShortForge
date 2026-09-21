# Intelligence: Dynamic Model Routing

> **Status**: OPERATIONAL  
> **Location**: `apps/web/factoryos/core/cognitive/` & `apps/web/lib/ai/`  

---

## 1. Provider Discovery & Capability Probing
- Dynamically discovers active AI providers at boot (Gemini, Claude, OpenAI, Local Ollama).
- Inspects available capabilities (text synthesis, structured JSON mode, vision analysis, audio generation).
- Routes prompts according to task type, latency targets, and cost profile:
  - **Reasoning & Planning**: High-capability LLMs (Gemini Pro, Claude 3.5 Sonnet).
  - **Fast Script Formatting**: Low-latency LLMs (Gemini Flash, GPT-4o Mini).
  - **Offline/Testing Fallback**: Deterministic rule engines and mock providers.
