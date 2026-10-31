# Wave 7.1 Template Architecture: Deep Explainer V2 (`facts.deep-explainer.v2`)

**Authority:** Principal Video Production Architect & Release Captain  
**Date:** 31 October 2026  
**Repository:** `https://github.com/Gokul7904231/ShortForge`  
**Template Identity:** `facts.deep-explainer.v2`  
**Supersedes:** `facts.deep-explainer.v1` (retained for regression comparison)  
**Status:** **SPECIFIED & REGISTERED**

---

## 1. Executive Summary & Design Direction

The previous `facts.deep-explainer.v1` produced an unsatisfactory creator experience:
- Generic purple circles and blank slate container cards.
- Subtitle collisions with center recipe cards.
- Headings rendered in oversized all-caps extending beyond frame boundaries.
- Character encoding mojibake (`1960 â€“ 2026`).
- Fixed 9-scene assumption without duration calibration.

`facts.deep-explainer.v2` transforms the educational short into a **cinematic vertical documentary**:
- **Full-Bleed Visual Dominance:** Real photographic or bathymetric/scientific imagery serves as the primary visual foundation of every scene.
- **Editorial Typography Hierarchy:** High-contrast, clean sans-serif typography with strict safe-area margins (top: 160px, bottom: 320px, left: 80px, right: 80px).
- **Separated Timed Subtitles:** Lower-third captions synchronized to spoken narration, isolated from central graphic elements to eliminate visual collisions.
- **Duration Pacing:** Dynamically scaled narrative word count and scene structure calibrated to requested runtime (60s vs 180s) at ~2.3 words/sec.

---

## 2. Narrative Arc & Scene Design (180s Documentary)

| Scene # | Narrative Role | Shot Recipe | Visual Asset Intent | Typography & Card Hierarchy | Narration Target (wps ~2.3) |
|---|---|---|---|---|---|
| **Scene 1** | **Hook** | `KINETIC_HOOK` | Full-bleed hero photograph of deep ocean trench or research vessel | Provocative headline with subtle dark contrast scrim; glowing accent tag pill | ~20–25 words (~9–10s) |
| **Scene 2** | **Physical Setting** | `DOCUMENTARY_MAP` / `FULL_BLEED_IMAGE` | High-resolution bathymetric chart / Western Pacific geographic map | Concise geographic coordinate card & source attribution label | ~35–42 words (~15–18s) |
| **Scene 3** | **Core Mechanics** | `IMAGE_WITH_CAPTION` | Subduction zone scientific diagram / tectonic plate schematic | Clear explanatory title and concise scientific breakdown label | ~38–44 words (~16–19s) |
| **Scene 4** | **Record Scale** | `BIG_NUMBER` | High-contrast deep sea floor photograph with dark overlay | Massive numerical depth metric (`11,000 M`) with subordinate unit label | ~35–40 words (~15–17s) |
| **Scene 5** | **Comparative Scale**| `STAT` | Deep ocean submersible hull / pressure vessel photograph | Distinct pressure measurement (`1,000+ ATM`) with comparative scale subtitle | ~35–40 words (~15–17s) |
| **Scene 6** | **Exploration Chronology** | `TIMELINE_BUILD` | Archival photograph of bathyscaphe *Trieste* (1960) | Clean date badge (`1960 – 2026`), event title, and verified expedition summary | ~35–42 words (~15–18s) |
| **Scene 7** | **Evidence & Citation** | `SOURCE_CARD` | Research institution exploration imagery / sonar mapping | Verifiable research source citation badge with grounded claim summary | ~35–40 words (~15–17s) |
| **Scene 8** | **Scientific Frontier**| `FULL_BLEED_IMAGE` | Hadal zone organism photograph (e.g. Mariana snailfish / amphipod) | Scientific discovery headline with takeaway research impact description | ~35–42 words (~15–18s) |
| **Scene 9** | **Synthesis & Outro** | `OUTRO_CTA` | Atmospheric deep abyssal gradient with subtle brand badge | Editorial takeaway statement and clean subscribe prompt | ~18–22 words (~8–10s) |

---

## 3. Typography & Layout Safe Area Specification

```
+-------------------------------------------------------------------------+ 1920px
| [Safe Top: 0 - 160px] Header Safe Margin (Platform status bars / UI)    |
|-------------------------------------------------------------------------| 160px
| Level 1: Scene Headline / Section Title (max 2 lines, 52pt)             |
|                                                                         |
|                                                                         |
| Level 2: Center Content Area (y: 400 - 1400px)                          |
|   - Full-bleed background image with 40-50% luminance dampening         |
|   - Recipe element (Big Number / Stat / Archival Photo / Quote)          |
|   - Level 3: Data / Source Attribution Badge (small, clear, subordinate) |
|                                                                         |
|                                                                         |
|-------------------------------------------------------------------------| 1540px
| Level 4: Timed Subtitles (y: 1540 - 1660px, max 2 lines, 48pt)          |
|-------------------------------------------------------------------------| 1660px
| [Safe Bottom: 1660 - 1920px] Footer Safe Margin (Captions / Action UI)  |
+-------------------------------------------------------------------------+ 0px
  0px                                                                   1080px
  [Left: 80px]                    [Right: 1000px]
```

---

## 4. Character Encoding & Unicode Integrity Contract

- All strings across JSON payloads, TypeScript interfaces, and Python subprocesses are strictly **UTF-8 encoded**.
- Explicitly enforces `sys.stdin.reconfigure(encoding='utf-8')` and `sys.stdout.reconfigure(encoding='utf-8')` in Python runtime.
- Verifies that en-dashes (`–`, U+2013) and em-dashes (`—`, U+2014) render as clean typographical punctuation without mojibake (`â€“` or `â€”`).

