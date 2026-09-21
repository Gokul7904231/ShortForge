---
name: factoryos-evidence
description: Skill for extracting, verifying, and navigating physical evidence and EvidenceGraph records in FactoryOS.
---

# FactoryOS Evidence Navigation Skill

## Invariants
1. Physical artifacts > Authoritative state > Normalized events > System assertions > Model judgments.
2. Every node in the `MissionGraph` marked `VERIFIED` must be grounded by at least one supporting `EvidenceEdge` pointing to an `EvidenceNode`.

## Evidence Categories
- `PHYSICAL_FILE_ON_DISK`: Confirmed via `fs.existsSync` and `fs.statSync`.
- `SHA256_BYTE_DIGEST`: Cryptographic digest calculated directly from disk bytes.
- `FFPROBE_STREAM_METRIC`: Format/stream probe confirming width 1080, height 1920, h264, aac.
- `FFMPEG_DECODE_SMOKE`: Frame-by-frame decode test with zero fatal decode frames.
- `DELIVERY_OUTBOX_RECEIPT`: Physical outbox receipt proving delivery ready for publishing.

## Verification Pattern
To check evidence for a specific run:
```bash
cat testing/reports/output/<runId>.json | grep -A 10 "evidenceGraph"
```
