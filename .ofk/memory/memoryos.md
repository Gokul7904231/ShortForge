# Memory: MemoryOS Specification

> **Status**: OPERATIONAL  
> **Location**: `apps/web/factoryos/core/memory/`  

---

## 1. Dual-Tier Memory Architecture

FactoryOS utilizes a dual-tier cognitive memory model:

1. **Working Memory (Episodic)**:
   - Stores active run events, floor progression logs, and temporary task outputs.
   - Bound to the mission lifecycle; cleared or compacted upon mission completion.
2. **Long-Term Memory (Semantic & Procedural)**:
   - Preserves high-performing scripts, winning visual motifs, audience retention feedback, and past Slayer incident resolutions.
   - Indexed via vector embeddings for semantic recall during Floor 01 Strategy and Floor 02 Scripting.
