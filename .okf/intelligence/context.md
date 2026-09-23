# Intelligence: Context Management & Memory Injection

> **Status**: OPERATIONAL  
> **Location**: `apps/web/factoryos/core/memory/`  

---

## 1. Context Boundaries & Window Packing
- Enforces strict window caps to prevent LLM context exhaustion.
- Compresses multi-turn conversation logs into dense episodic memories via `MemoryEngine`.
- Injects floor-specific knowledge items and schema guidelines dynamically into task prompts.
