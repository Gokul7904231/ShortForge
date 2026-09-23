# Workflows: End-to-End Generation Workflow

> **Status**: OPERATIONAL  

---

## 1. Sequence Diagram & Stage Progression

```
User/UI               POST /api/generate-video         Overseer / DAG           Floor 01-07           Azure / Render Fabric
   │                            │                            │                       │                        │
   ├────── Submit Request ─────►│                            │                       │                        │
   │                            ├─ Quota Reservation ───────►│                       │                        │
   │                            ├─ Init Job Manifest ───────►│                       │                        │
   │                            ├─ Start Mission ───────────►│                       │                        │
   │◄───── HTTP 200 (queued) ───┤                            │                       │                        │
   │                            │                            ├─ Floor 01 Strategy ──►│                        │
   │                            │                            ├─ Floor 02 Script ────►│                        │
   │                            │                            ├─ Floor 03 Asset ─────►│                        │
   │                            │                            ├─ Floor 04 Audio/TTS ─►│                        │
   │                            │                            ├─ Floor 05 Timeline ──►│                        │
   │                            │                            ├─ Floor 06 Render ─────────────────────────────►│
   │                            │                            │                       │◄── Callback (Token) ───┤
   │                            │                            ├─ Floor 07 Verify ────►│                        │
   │                            │                            ├─ Finalize Quota ─────►│                        │
   │◄───── SSE / Presence Stream (Completed) ────────────────┤                       │                        │
```
