# Wave 7.1 Visual Asset Architecture & Materialization Integration

**Authority:** Senior Visual Intelligence Engineer & Release Captain  
**Date:** 31 October 2026  
**Repository:** `https://github.com/Gokul7904231/ShortForge`  
**Reference Incident:** Missing / ineffectual background imagery in `job_prod_accept_mvw01pma`  
**Status:** **ROOT CAUSE IDENTIFIED & RECONCILED**

---

## 1. Executive Summary & Problem Analysis

In reference production `job_prod_accept_mvw01pma`, human creator review revealed:
> **"Visually repetitive purple circles and generic information cards instead of meaningful documentary imagery."**  
> **"Missing or ineffective Openverse/Wikimedia background photographs."**

Our investigation isolated the exact architectural defects that prevented real photographs from reaching the renderer:

1. **Remote URL vs. Local File Disconnect:**  
   In `apps/web/lib/templates/providers/ProviderRouter.ts` (lines 76–82), the `WikimediaAdapter` resolved images by searching Wikimedia Commons and returning a remote HTTPS URL string (`uri: "https://upload.wikimedia.org/..."`) without downloading or materializing the bytes.
2. **`fs.existsSync()` Failure on HTTPS URLs:**  
   In `apps/web/factoryos/core/templates/TemplateProductionPipeline.ts` (line 845):
   ```typescript
   if (primary.uri && fs.existsSync(primary.uri)) {
     props.image_path = primary.uri;
   } else if (primary.content) {
     ...
   }
   ```
   `fs.existsSync("https://upload.wikimedia.org/...")` returned `false`. `primary.content` (inline SVG) was `undefined`. Consequently, `props.image_path` remained `undefined`.
3. **Empty Asset Requirements in `ShotRecipeLibrary.ts`:**  
   Recipes like `SOURCE_CARD`, `BIG_NUMBER`, `STAT`, `TIMELINE_BUILD`, and `QUOTE_CARD` declared `assetRequirements: []`. They never even requested background imagery.
4. **Renderer Fallback Card & Purple Orb:**  
   In `packages/factoryos-render/src/factoryos_render/backends/image.py` (lines 116–120 & 303–310), when `image_path` was absent or failed to load, the renderer defaulted to:
   - An indigo orb: `draw.ellipse([cx - orb_r, cy - orb_r, cx + orb_r, cy + orb_r], fill=(99, 102, 241, 18))`.
   - A generic slate card: `draw.rounded_rectangle(..., fill=(30, 41, 59, 200))`.

---

## 2. Reusing Existing ShortForge Visual Intelligence (`apps/web/lib/visual-assets/`)

Instead of inventing a third visual retrieval system, we unify `ProviderRouter` with the robust visual infrastructure in `apps/web/lib/visual-assets/`:

- **`ProviderFramework.ts`:** Contains battle-tested `WikimediaProvider` and `OpenverseProvider` query engines with licensing, attribution, author, and dimensional extraction.
- **`VisualPipeline.ts`:** Contains `ensureLocalCachePath()` with `validateImageBuffer()` for magic-byte verification.
- **`AssetCurator.ts`:** Performs high-performance 1080×1920 9:16 normalization via Sharp (`fit: 'cover', position: 'entropy'`), evaluates sharpness/watermarks, and computes true cryptographic SHA-256 digests.
- **Content-Addressable Storage (CAS):** Stores verified image files locally at `data/visual-assets-cache/${sha256}.jpg`.

---

## 3. The Canonical Materialization Flow

```
+---------------------------------------------------------------------------------------------------+
|                              CANONICAL VISUAL ASSET FLOW                                          |
+---------------------------------------------------------------------------------------------------+
|  1. Scene Intent & Asset Requirement (ShotRecipeLibrary declares mandatory primaryBackground)    |
|  2. Semantic Search (Wikimedia / Openverse via ProviderFramework)                                 |
|  3. License & Domain Policy Check (CC0, CC-BY, CC-BY-SA; reject non-commercial / unknown)         |
|  4. Byte Download & Buffer Validation (Magic byte inspection prevents HTML/corrupt downloads)    |
|  5. 1080x1920 9:16 Normalization (AssetCurator entropy-guided cover crop)                         |
|  6. Disk Persistence in CAS (`data/visual-assets-cache/${sha256}.jpg`)                             |
|  7. Cryptographic Binding (True SHA-256 computed on physical bytes)                              |
|  8. Attached to Scene (Verified local absolute path in `scene.props.image_path`)                   |
|  9. Rendered Full-Bleed (Pillow loads clean local JPEG into video frame background)               |
+---------------------------------------------------------------------------------------------------+
```

---

## 4. One Q&A Unit $\rightarrow$ One Primary Background Image Contract

For educational documentary and Q&A content:
$$\mathbf{1\text{ Factual / Q\&A Unit} \longrightarrow 1\text{ Primary Background Image} \longrightarrow 1\text{ Spoken Narration Segment} \longrightarrow 1\text{ Visual Scene}}$$

- Each scene receives one relevant, topic-grounded visual asset (e.g. bathymetric chart, hadal submersible, snailfish specimen).
- Avoids multiple rapid flashing images or identical generic backgrounds across questions.
- Retains complete provenance: Source URL, Author/Creator, Exact License, Retrieval Timestamp, Physical Dimensions, and SHA-256.

