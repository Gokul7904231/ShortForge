# Security: Zero-Trust Perimeter Model

> **Status**: OPERATIONAL  

---

## 1. Perimeter Guarantees
1. **No External Bypasses**: All inbound generation requests pass through `POST /api/generate-video` or `POST /api/overseer/command` with authenticated session headers.
2. **Timing-Safe Callbacks**: Worker callbacks are verified using `crypto.timingSafeEqual` over execution tokens, preventing timing attack side-channels.
3. **No Execution Fallthrough**: If execution authority is `factoryos`, legacy untracked pipelines cannot be triggered.
4. **Clean Boundary Serialization**: Inbound external inputs are validated and sanitized via Zod schemas before being accepted into the Task DAG.
