# ShortForge F12 — Template Pack Contract (ShortForgeTemplatePack/v1)

**Document Reference:** `docs/verification/f12-template-pack-contract.md`  
**Execution Date:** 2026-11-06  
**Status:** SPECIFIED & IMPLEMENTED  
**Implementation File:** `apps/web/lib/templates/schemas/TemplatePackSchema.ts`  

---

## 1. Specification Overview

`ShortForgeTemplatePack/v1` establishes a clean, versioned, vendor-agnostic archive contract for external design templates (e.g. Canva, Figma) imported into ShortForge.

A design pack archive (`.zip`) must contain:
```text
<pack-root>/
├── manifest.json       # Valid ShortForgeTemplatePack/v1 manifest
├── assets/             # Visual and media assets referenced by stable IDs
│   ├── question-01.png
│   ├── question-02.png
│   ├── ...
│   └── shortforge-watermark.png
└── preview/            # Optional preview graphics
    └── preview.png
```

---

## 2. Manifest Schema Fields

The `manifest.json` file must validate against `ShortForgeTemplatePackManifestSchema`:

| Field | Type | Description |
| :--- | :--- | :--- |
| `schemaVersion` | `"ShortForgeTemplatePack/v1" \| "1.0.0"` | Contract version |
| `identity` | `Object` | `id`, `version`, `name`, `slug`, `author`, `isSystem` (`false` for imported packs) |
| `category` | `ContentCategory` | `QUIZ`, `FACTS`, `HISTORY`, `MOTIVATION`, etc. |
| `formatFamily` | `String` | Visual format (e.g. `Interactive Quiz`) |
| `description` | `String` | Human-readable description |
| `sourceProvenance` | `Object` | `provider` (`CANVA`), `designer`, `externalDesignId`, `exportedAt` |
| `outputPolicy` | `Object` | `width` (1080), `height` (1920), `fps` (30), `targetDurationRange` ([30, 60]) |
| `storyStructure` | `Array<Step>` | Sequence of narrative beats mapped to canonical `ShotRecipeId`s |
| `editableVariables` | `Array<Variable>` | User-configurable parameters (e.g. `subject`, `difficulty`) |
| `assetBindings` | `Array<AssetBinding>` | Mapping of stable asset IDs to archive files, roles, and MIME types |
| `textOverlays` | `Array<TextOverlay>` | Normalized coordinate text positioning and typography constraints |
| `license` | `LicenseMetadata` | Provenance licensing tier and distribution constraints |
| `previewImage` | `String` (optional) | Relative path to pack preview image |

---

## 3. Supported Asset Roles

- **`BACKGROUND`**: Full-frame or atmospheric photographic/gradient backdrops.
- **`FOREGROUND`**: Central graphic subjects, badges, or framed illustrations.
- **`LOGO`**: Channel, team, or sponsor logo overlays.
- **`WATERMARK`**: Global brand watermark (e.g., ShortForge watermark at bottom right).
- **`DECORATION`**: Glass frames, countdown dials, divider lines, and card containers.
- **`VIDEO`**: Pre-rendered dynamic background motion plates (strictly as background/B-roll, never replacing the editable native template).
- **`AUDIO`**: Bed audio or custom SFX clips.

---

## 4. Text Overlay Normalized Coordinates

All text overlays specify positioning using normalized dimensions between `0.0` and `1.0`:
- `x`: Relative horizontal start from left ($x \in [0.0, 1.0]$)
- `y`: Relative vertical start from top ($y \in [0.0, 1.0]$)
- `width`: Relative horizontal width ($w \in [0.0, 1.0]$)
- `height`: Relative vertical height ($h \in [0.0, 1.0]$)

This guarantees resolution independence across preview displays, 1080×1920 production renders, and potential 4K upscale exports.

---

## 5. Licensing Governance

| License Tier | Redistribution Permitted | Public Community Status | Default Capability Status |
| :--- | :---: | :---: | :--- |
| `ORIGINAL_USER` | Configurable | Allowed | `READY` |
| `CANVA_FREE` | Restricted | Allowed with attribution | `READY` |
| `CANVA_PRO` | **FALSE** | **BLOCKED (Owner-Only)** | `READY` (Private execution) |
| `INDEPENDENT_EXTERNAL`| According to license | Review required | `READY` |
| `UNVERIFIED` | **FALSE** | **BLOCKED** | `BLOCKED` |

Canva Pro exports cannot be redistributed as public ShortForge templates; they are isolated to the owner's private rendering workspace.

