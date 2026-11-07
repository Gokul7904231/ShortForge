# ShortForge F12 — Canva Asset Pack Importer Codebase Audit

**Document Reference:** `docs/verification/f12-canva-import-audit.md`  
**Execution Date:** 2026-11-06  
**Auditor:** Principal Software Architect, Senior Full-Stack Engineer, Rendering Pipeline Engineer  
**Status:** COMPLETE — BASELINE VERIFIED  

---

## 1. Executive Summary

This audit establishes the architectural foundation for ShortForge F12: Canva Design Template Pack Import. The objective is to allow ShortForge owners to export visual assets from Canva (under Canva Pro Lite without requiring unsupported Canva Autofill Enterprise APIs), package them into a structured design archive, import and validate them securely, register a native `TemplateDefinition`, and render high-fidelity vertical video shorts using ShortForge's authoritative `FactoryOS` and `factoryos-render` engines.

---

## 2. Core Subsystems Inspected

### 2.1 Template Registry & Schemas
- **`apps/web/lib/templates/schemas/TemplateSchema.ts`**:
  - Defines `TemplateDefinitionSchema`, `ContentCategorySchema`, `ShotRecipeContractSchema`, `SafeArea916Schema`, `CapabilityStatusSchema`.
  - Defines shot recipes: `KINETIC_HOOK`, `QUESTION_CARD`, `ANSWER_REVEAL`, `COUNTDOWN`, `OUTRO_CTA`, `IMAGE_WITH_CAPTION`, `FULL_BLEED_IMAGE`.
  - Native geometry contract: 1080x1920 (9:16 portrait), 30 fps. Safe area: top 160px, bottom 320px, left 60px, right 120px.
- **`apps/web/lib/templates/registry/TemplateRegistry.ts`**:
  - In-memory singleton with dual-indexing (`${id}@${version}` and latest unversioned alias `${id}`).
  - Validates templates strictly against `TemplateDefinitionSchema`.
  - Includes legacy migration path `migrateLegacyTemplate()`.
- **`apps/web/lib/templates/definitions/CanonicalTemplates.ts`**:
  - Contains canonical system templates (`quiz.trivia-challenge.v1`, `quiz.universal.glass.v1`, `quiz.universal.cinematic.v2`, `quiz.quizshow.v1`).
- **`apps/web/app/api/templates/route.ts`**:
  - `GET`: Reads from `TemplateRegistry` and `data/custom-templates.json`.
  - `POST`: Persists custom templates to `data/custom-templates.json`.
  - **Audit Finding (Defect 1)**: `POST` currently performs a naive array `push()` without checking for existing templates with the same `id` and `version`, causing duplication on repeated saves or re-imports. Must implement idempotent upsert.

### 2.2 Template Management UI
- **`apps/web/app/(os)/factory/templates/page.tsx`**:
  - Renders tabs: Official (`isOfficial: true`), My Templates (`!isOfficial && !isCommunity`), Community (`isCommunity: true`).
  - Supports searching, category filtering, inspecting template story structure, running video generation, and JSON export.
  - Currently relies on `NewTemplateForm` for basic prompt-only custom templates.
  - **Audit Finding (Gap 1)**: No UI exists to upload, inspect, validate, and register multi-asset ZIP design packs. Must add an "Import Design Pack" modal with live package manifest validation, asset inventory inspection, preview rendering, and registration status.

### 2.3 Asset Storage & CAS System
- **`apps/web/factoryos/core/compute/cas/ContentAddressedStore.ts`**:
  - Canonical content-addressed store storing files under `data/cas_storage/{shard}/{sha256}{ext}` with atomic writes and SHA-256 verification.
  - Generates immutable `ArtifactRef` records with byteLength, mimeType, and metadata.
  - **Audit Finding (Reuse Directive)**: We MUST store imported design pack assets into the CAS or managed asset hierarchy (`data/cas_storage/` and `assets/canva/packs/{pack_id}/`) rather than creating a duplicate ad-hoc storage directory.

### 2.4 Rendering Pipeline & Scene Lowering
- **`apps/web/factoryos/core/templates/TemplateProductionPipeline.ts`**:
  - Orchestrates: Template -> Script -> Assets -> Voice -> Timeline -> RenderIntent -> F06 Local Render -> physical MP4.
  - Compiles scenes with shot recipes (`KINETIC_HOOK`, `QUESTION_CARD`, `COUNTDOWN`, `ANSWER_REVEAL`, `OUTRO_CTA`).
  - Resolves background images, audio tracks, word-highlight captions, and props.
- **`packages/factoryos-render` (Python engine)**:
  - `factoryos_render.cli`: Verified operational with Python 3.13 and FFmpeg 8.1.2.
  - `NativeFrameCompositor` in `packages/factoryos-render/src/factoryos_render/backends/image.py`:
    - Handles `QUESTION_CARD` with category badge, glass card frame, and option cards.
    - Handles `COUNTDOWN` with timer pill and suspense tick styling.
    - Handles `ANSWER_REVEAL` with emerald highlight punch, checkmark, and explanation card.
    - Resolves design pack layers via `_get_design_pack_layer(pack_id, role)` looking in `assets/canva/packs/{pack_id}/` and `data/visual-assets-store/...`.
    - Composites ShortForge watermark at bottom right (940, 1800) from `assets/branding/shortforge-watermark.png`.
    - Handles atmospheric subject backdrops via `image_path` in `shot_props`.

---

## 3. Architecture & Data Flow for Canva Design Pack Import

```text
┌────────────────────────────────────────────────────────┐
│  Canva Pro Lite (Browser / Designer)                   │
│  - Designer authors 6 question frames & styling layers │
│  - Exports assets as PNG / ZIP                         │
└──────────────────────────┬─────────────────────────────┘
                           │ Uploads ZIP
                           ▼
┌────────────────────────────────────────────────────────┐
│  /api/templates/import-pack (Secure Import Route)      │
│  - Authenticates Owner / Admin                         │
│  - Anti-ZIP-bomb & path traversal checks               │
│  - Validates ShortForgeTemplatePack/v1 manifest.json   │
│  - Inspects image magic bytes & dimensions             │
│  - Ingests assets into ContentAddressedStore (CAS)     │
│  - Caches unpacked assets in assets/canva/packs/       │
│  - Normalizes manifest -> native TemplateDefinition    │
│  - Idempotent upsert in data/custom-templates.json     │
│  - Registers in TemplateRegistry                       │
└──────────────────────────┬─────────────────────────────┘
                           │ Native Template Registered
                           ▼
┌────────────────────────────────────────────────────────┐
│  FactoryOS TemplateProductionPipeline                  │
│  - Resolves 6 distinct question scenes                 │
│  - Maps pack background assets (question-01..06.png)   │
│  - Synthesizes female narration & word-level captions  │
│  - Enforces 5.0s digital silence think-gate            │
│  - Emits LocalRenderIntent with pack assets            │
└──────────────────────────┬─────────────────────────────┘
                           │ LocalRenderIntent JSON
                           ▼
┌────────────────────────────────────────────────────────┐
│  factoryos-render (Local Python / FFmpeg Engine)       │
│  - Renders 1080x1920 30fps frames with Pillow          │
│  - Composites question card, options, timer, reveal    │
│  - Composites ShortForge watermark at bottom right     │
│  - Encodes H.264 / AAC MP4                             │
│  - F07 Release Guardian verifies physical MP4 truth    │
└────────────────────────────────────────────────────────┘
```

---

## 4. Key Design Decisions & Audit Outcomes

1. **Zero Canva Autofill Dependency**: Canva Pro Lite cannot use the Canva Autofill Enterprise API. Design pack assets provide static background cards and visual framing layers; ShortForge's template engine dynamically injects questions, options, timer countdowns, and answer reveals.
2. **Unified CAS Asset Storage**: All uploaded assets are validated by SHA-256 and stored via `ContentAddressedStore` to prevent duplicate files and guarantee tamper-evident physical integrity.
3. **Idempotent Registry Upsert**: `apps/web/app/api/templates/route.ts` and the new import API must update existing records when `identity.id` and `identity.version` match, preventing duplicate growth of `custom-templates.json`.
4. **Ownership & Licensing Governance**:
   - Owner-imported templates are assigned `identity.isSystem: false`, `isOfficial: false`.
   - Canva Pro exports receive `license.licenseType: "CANVA_PRO"`, which prohibits public re-distribution and restricts usage to owner private rendering.
   - Unverified packages are tagged `capabilityStatus: "BLOCKED"`.

