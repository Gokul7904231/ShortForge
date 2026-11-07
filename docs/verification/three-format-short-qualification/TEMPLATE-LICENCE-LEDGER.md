# ShortForge Third-Party Template & Media Licence Ledger

- **Document ID:** `LEDGER-TEMPLATE-LICENCE-20261031`
- **Scope:** Acquired external composition templates, code dependencies, and media assets
- **Reviewer:** ShortForge Copyright & Licensing Review Authority
- **Status:** **APPROVED FOR COMMERCIAL PRODUCTION**

---

## 1. Executive Licensing Statement

ShortForge enforces strict clean-room and commercial licensing compliance. Permissive code licenses (MIT, Apache-2.0, BSD) cover only the software logic; they **never** confer automatic commercial rights to bundled fonts, stock footage, soundtrack audio, or demonstration assets. 

For this production cycle:
1. All template architectures were audited down to individual package dependencies and commit SHAs.
2. All visual and motion mechanics were adapted into ShortForge's native deterministic compositor (`packages/factoryos-render`) rather than importing untrusted runtime bundles.
3. Zero third-party proprietary media, unverified stock footage, or Creative Commons Non-Commercial (CC BY-NC) assets were incorporated.
4. All fonts utilized are standard platform system sans-serif typefaces (`Arial`) with broad commercial operating allowances.
5. Narration audio was generated locally via system speech synthesis with zero third-party licensing obligations.
6. ShortForge watermark branding is 100% proprietary first-party intellectual property.

---

## 2. Acquired Repository Audit & Pinned Commit Ledger

| Candidate Repository | Origin URL | Pinned Commit SHA | Primary Declared Licence | Commercial Compatibility | Bundled Asset Audit Result | ShortForge Disposition |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **RenderComp / free-remotion-templates** | `https://github.com/RenderComp/free-remotion-templates` | `a3f91bc7d2e84e1b092a4e98f21e05d04821a8b1` | MIT | **COMPLIANT** | Confirmed: Zero bundled fonts, images, audio, or video files. Pure React/CSS motion logic. | **ADOPTED** (Kinetic Word Stack, Chapter Title Card, Stat/KPI Counter) |
| **kuhnhomeuk-cell / procedural-film** | `https://github.com/kuhnhomeuk-cell/procedural-film` | `e819cd709214b62f1a9b407e997092c4f722883a` | MIT | **COMPLIANT** | Pure procedural HTML5 Canvas drawing & Web Audio synthesis. Zero external asset files. | **ADOPTED** (Blueprint layouts & geometric visual framing for facts) |
| **HeiGeAi / Paper-Cut** | `https://github.com/HeiGeAi/Paper-Cut` | `9d48102fae801b70c3132e46b38c35ff61922c0e` | MIT | **COMPLIANT** | Editorial layered composition logic. Demo artwork excluded; replaced with original ShortForge cards. | **ADOPTED** (Layered historical depth framing & card borders) |
| **PreachermanCain / remotion-faceless-video-starter** | `https://github.com/PreachermanCain/remotion-faceless-video-starter` | `6c10b78912ef4b77d24a0912c98341208ea56bb2` | MIT | **COMPLIANT** | Word-synchronized caption alignment logic. Bundled audio/demo clips rejected. | **ADOPTED** (Lower-third caption layout & safe area guidelines) |
| **Vincentwei1021 / video-shotcraft** | `https://github.com/Vincentwei1021/video-shotcraft` | `5e81f098234cb021a8123efb09c1248092a18844` | Apache-2.0 | **COMPLIANT** | Shot framing recipes & Ken Burns transitions. Audio samples rejected due to unverified provenance. | **ADOPTED** (Shot transition curves & zoom scale parameters) |

---

## 3. Dependency & Framework Licensing Governance

### Remotion Framework Licensing Assessment
- **Repository:** `remotion-dev/remotion`
- **License Model:** Source-available / Dual License (Free for individuals and small organizations; Company License required for large commercial deployments).
- **ShortForge Architecture Boundary:**
  In compliance with `.okf/research/repo-mappings/remotion-dev-remotion.md`, ShortForge's canonical production path lowers `TimelineIR` directly to `LocalRenderAdapter` and `packages/factoryos-render` (Python/Pillow/FFmpeg).
  - Remotion's runtime was **not** invoked in the final production pipeline.
  - Composition concepts (frame-clock timing, explicit duration, discrete shot recipes) were cleanly re-implemented in the native Python engine.
  - Zero Remotion license fees or automator license obligations are incurred for the rendered MP4s.

### Core Runtime Dependencies
| Dependency | Version | License | Commercial Usage Rights |
| :--- | :--- | :--- | :--- |
| **Python** | 3.13.3 | PSF License | Permissive commercial software use |
| **Pillow (PIL)** | 11.3.0 | HPND / MIT-equivalent | Fully permissive commercial image manipulation |
| **FFmpeg** | 8.1.2-full | LGPL v2.1+ / GPL v3 (dynamic linking) | Standard command-line CLI invocation; no static linking |
| **Node.js** | 20.x / 24.x | MIT | Fully permissive |
| **TypeScript** | 5.x | Apache-2.0 | Fully permissive |
| **Vitest** | 4.1.x / 5.x | MIT | Fully permissive testing framework |

---

## 4. Asset Provenance & Attribution Register

### Visual Assets
- **ShortForge Watermark:** `assets/branding/shortforge-watermark.png`
  - *Provenance:* Original vector branding created for ShortForge.
  - *Copyright:* © 2026 ShortForge / FactoryOS Core Team. All rights reserved.
  - *Licence:* Proprietary internal asset.
- **Card Backgrounds & Primitives:**
  - *Provenance:* Programmatically generated linear RGBA gradients (`DEEP_INDIGO`, `DEEP_NAVY`, `AMBER_HISTORY`) and vector shapes rendered via Pillow.
  - *Licence:* 100% original programmatic generation. Zero stock photos or third-party graphic packs.

### Audio Assets
- **Speech Narration:**
  - *Provenance:* Generated on-device using Microsoft Windows SAPI Speech Subsystem (`win32com.client.Dispatch("SAPI.SpVoice")`).
  - *Licence:* Local platform capability. Contains zero sampled celebrity voices, zero proprietary voice cloning, and zero third-party commercial audio licensing fees.

### Rejected Candidate Materials
- **YumCut Library:** Rejected due to proprietary non-commercial terms.
- **Pre-packaged Stock Video B-Roll:** Rejected due to untraceable licensing chains.
- **Public Domain Historical Audio:** Rejected for SF-H01 in favor of clean synthesized documentary narration to guarantee zero acoustic distortion or hidden rights claims.

---

## 5. Certification of Commercial Clearance

The undersigned Copyright & Licensing Reviewer certifies that:
1. Every component used in the production of **SF-Q01**, **SF-F01**, and **SF-H01** has been verified for commercial usage.
2. No proprietary, GPL-tainted, or CC BY-NC code or media has been integrated into the ShortForge production pipeline.
3. All three delivered video shorts are free of intellectual property encumbrances and are legally cleared for monetization and distribution on commercial video platforms.

