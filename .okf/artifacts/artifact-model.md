# Artifacts: The FactoryOS Content-Addressed Artifact Model

> **Status**: OPERATIONAL / CANONICAL  
> **Source Location**: `apps/web/factoryos/core/agent/AgentRuntimeContracts.ts` & `apps/web/lib/jobs-history.ts`

---

## 1. Architectural Philosophy: Immutability & Content Addressing

In FactoryOS, media artifacts are not treated as mutable files in shared file systems. When an agent or compute worker produces an output (a research slate, an editorial blueprint, a script beat sheet, an image asset, a speech audio buffer, a TimelineIR manifest, or a rendered MP4), that output is treated as an immutable, content-addressed artifact.

Every artifact possesses:
1. **Cryptographic Digest**: A SHA-256 hash computed over its canonical byte serialization.
2. **Lineage Metadata**: Explicit parent artifact IDs, the originating floor ID (`FloorId`), producing agent ID, and distributed `TraceContext`.
3. **Storage Location**: Stored in Content-Addressed Storage (CAS) or cloud object storage referenced by immutable digest URIs (`cas://sha256:...`).

```
┌────────────────────────────────────────────────────────┐
│                    Canonical Artifact                  │
├────────────────────────────────────────────────────────┤
│  id: "art_01j8m..."                                    │
│  sha256: "e3b0c44298fc1c149afbf4c8996fb92427..."      │
│  floorId: "FLOOR_05_TIMELINE_COMPOSITION"              │
│  type: "TIMELINE_IR"                                   │
│  parentArtifactIds: ["art_script_01", "art_audio_02"] │
│  traceContext: { traceId, spanId, missionId }          │
│  createdAt: 1718000000000                              │
├────────────────────────────────────────────────────────┤
│                        Payload                         │
│  (Canonical JSON Manifest or Binary Media Buffer)      │
└────────────────────────────────────────────────────────┘
```

---

## 2. CURRENT vs TARGET Architecture Status

| Architectural Dimension | CURRENT Implementation | TARGET Implementation |
|:------------------------|:-----------------------|:----------------------|
| **Artifact Representation** | `VideoJob` manifest in database + `AgentArtifactRecord` in runtime | Fully decentralized Content-Addressed Storage (CAS) with deduplication |
| **Integrity Verification** | Cryptographic SHA-256 hash verification on render artifacts | Zero-knowledge proof (ZKP) verification over multi-stage media transformations |
| **Lineage Tracking** | Parent artifact ID arrays and `TraceContext` linking | Graph database (Neo4j / Amazon Neptune) storing the complete provenance DAG |
| **Storage Tiering** | Local filesystem scratch cache + cloud blob storage | Tiered storage (NVMe SSD hot cache -> S3 standard -> Glacier cold archive) |
| **Schema Validation** | Strict TypeScript and Zod schema validation per floor | Self-describing schema evolution via protocol buffers / Apache Avro |

---

## 3. Floor-by-Floor Canonical Artifact Types

| Floor | Produced Artifact Type | Content Format | Canonical Output Schema |
|:------|:-----------------------|:---------------|:------------------------|
| **F00** | `DAILY_CONTENT_SLATE` | JSON | Slate of vetted topics backed by `ResearchPassport` |
| **F01** | `EDITORIAL_BLUEPRINT` | JSON | Hook concepts, retention curves, pacing guidelines |
| **F02** | `SCRIPT_BEAT_SHEET` | JSON / Text | Sequenced narrative beats, dialogue lines, visual cues |
| **F03** | `ASSET_MANIFEST` | JSON + Image Binaries | Verified image URLs/files, prompt seeds, aspect ratios ($9:16$) |
| **F04** | `SPEECH_AUDIO_PACKAGE` | JSON + Audio Binaries | Synthesized WAV/MP3 files, word/syllable timestamp arrays |
| **F05** | `TIMELINE_IR` | JSON | Multi-track vertical composition manifest ($1080 \times 1920$, 30fps) |
| **F06** | `RENDERED_VIDEO` | MP4 Binary | H.264 / AAC video file matching timeline specification |
| **F07** | `VERIFICATION_REPORT` | JSON | Structured findings, compliance scores, `VerificationReceipt` |

---

## 4. Immutability Invariant

Once written and registered in the CAS, an artifact is **never modified**. If an edit or repair is required (such as revising a script beat or trimming an audio clip):
1. A new artifact is created with its own unique ID and SHA-256 digest.
2. The new artifact references the original as its `predecessorArtifactId`.
3. The Mission state is updated to point to the new artifact version, maintaining an unbroken audit trail.
