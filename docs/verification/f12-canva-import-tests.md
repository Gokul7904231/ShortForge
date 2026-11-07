# ShortForge F12 — Canva Asset Pack Importer Test Report

**Document Reference:** `docs/verification/f12-canva-import-tests.md`  
**Execution Date:** 2026-11-06  
**Test Suite:** `apps/web/factoryos/tests/f12-canva-pack-importer.test.ts`  
**Status:** 7/7 PASSED (4.48s)  
**Governing Directives:** FactoryOS F12 Architecture & Canva Asset Pack Importer Specification  

---

## 1. Test Execution Summary

| Test Gate | Test Case | Target | Result | Evidence |
| :--- | :--- | :--- | :---: | :--- |
| **Gate 1: Sandbox & Security** | Path Traversal & Missing File | Nonexistent / malicious path | **PASS** | Descriptive error returned; zero disk corruption |
| **Gate 1: Sandbox & Security** | Manifest Strict Schema Validation | `manifest.json` schema rules | **PASS** | `ShortForgeTemplatePack/v1` validated with Zod |
| **Gate 1: Sandbox & Security** | Malformed Manifest Rejection | Corrupt schema / missing steps | **PASS** | Rejected with exact Zod validation issue list |
| **Gate 2: Ingestion & CAS** | Safe ZIP Extraction & CAS Storage | `shortforge-quiz-template.zip` | **PASS** | 7 assets ingested to CAS with 64-char SHA-256 |
| **Gate 2: Ingestion & CAS** | Registry Integration | `TemplateRegistry.getTemplate()` | **PASS** | Registered with `isSystem: false`, 20 beats |
| **Gate 2: Ingestion & CAS** | Idempotent Upsert | `data/custom-templates.json` | **PASS** | Duplicate imports update in-place; count stays 1 |
| **Gate 3: Physical Rendering**| FactoryOS Local Render & F07 | Full 6-question quiz short | **PASS** | Physical MP4 rendered, ffprobe audited, 1080×1920 |

---

## 2. Security & Sandbox Verification Details

### 2.1 Zip Bomb & Path Traversal Protections (`pack_inspector.py`)
- Archive size limit enforced: $\le 50\text{ MB}$.
- Member entry limit enforced: $\le 50\text{ files}$.
- Decompressed aggregate size limit: $\le 150\text{ MB}$.
- Compression ratio limit: $\le 100.0\times$ (rejects nested zip bombs).
- Path traversal rejection: Any member path starting with `..`, absolute drive paths (`C:`), or root slashes (`/`, `\`) is rejected before extraction.
- Symlink rejection: Members carrying UNIX symlink mode flags (`0o120000`) are blocked.

### 2.2 MIME Type Magic Byte Inspection
- PNG magic byte verification: `\x89PNG\r\n\x1a\n` required for `.png` files.
- JPEG magic byte verification: `\xff\xd8\xff` required for `.jpg` / `.jpeg` files.
- MP4 `ftyp` atom inspection required for `.mp4` video assets.

---

## 3. Ingestion & Content-Addressed Storage Evidence

The test package `packages/sample-packs/shortforge-quiz-template.zip` was imported into ShortForge's CAS:

| Asset ID | Role | File Path | MIME Type | Dimensions | CAS Status |
| :--- | :--- | :--- | :--- | :---: | :---: |
| `bg_question_01` | `BACKGROUND` | `assets/question-01.png` | `image/png` | 1080×1920 | Ingested |
| `bg_question_02` | `BACKGROUND` | `assets/question-02.png` | `image/png` | 1080×1920 | Ingested |
| `bg_question_03` | `BACKGROUND` | `assets/question-03.png` | `image/png` | 1080×1920 | Ingested |
| `bg_question_04` | `BACKGROUND` | `assets/question-04.png` | `image/png` | 1080×1920 | Ingested |
| `bg_question_05` | `BACKGROUND` | `assets/question-05.png` | `image/png` | 1080×1920 | Ingested |
| `bg_question_06` | `BACKGROUND` | `assets/question-06.png` | `image/png` | 1080×1920 | Ingested |
| `shortforge_watermark` | `WATERMARK` | `assets/shortforge-watermark.png` | `image/png` | 500×500 | Ingested |

Assets are cached at:
- `assets/canva/packs/quiz.canva.v1/`
- `data/cas_storage/{shard}/{sha256}.png`

---

## 4. Idempotency Assertion

Repeated calls to `importer.importPackFromZip()` against `shortforge-quiz-template.zip`:
- Before re-import count of `quiz.canva.v1` in `data/custom-templates.json`: 1
- After re-import count of `quiz.canva.v1` in `data/custom-templates.json`: 1
- **Result:** No duplicate records created; updates applied in-place.

