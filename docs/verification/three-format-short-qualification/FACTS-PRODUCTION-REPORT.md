# ShortForge Format Qualification Report: SF-F01 (Facts)

- **Job ID:** `SF-F01`
- **Category:** Rapid Facts (`facts.rapid-facts.v1`)
- **Topic:** 3 Verified Realities: The Mariana Trench
- **Render Output:** `artifacts/three-format-shorts/SF-F01-facts-the-mariana-trench.mp4`
- **Output SHA-256:** `032049d5926ec0150b07e780447fa4757c29377c7fec349ca6937e19d678b84d`
- **Status:** **PUBLISH CANDIDATE (REMEDIATED RUN 2)**

---

## 1. Remediation Summary & Quality Gate Results

Following the human rejection of Run 1 due to visual repetition and silent sections, Run 2 implemented:
1. **Grounded Science (Defect Remediation):** Completely removed hardcoded fake claims (e.g. lithium density, arbitrary 84% statistics). Grounded 100% in peer-reviewed oceanographic measurements: Challenger Deep 10,994m depth benchmark, 1,086 BAR hydrostatic pressure, and Pseudoliparis swirei snailfish adaptations.
2. **Procedural-Film Integration:** Applied `kuhnhomeuk-cell/procedural-film` drawn blueprint styling (`#0A1426` navy background with cyan 40px grid lines and technical coordinate annotations).
3. **Dedicated Topic Visuals:** Rendered three full-resolution custom vector diagrams: bathymetric depth profile with Mt Everest comparison, 1,086 BAR hydrostatic pressure dial, and hadal snailfish anatomical blueprint.
4. **Silence Remediation:** Synthesized per-scene speech WAVs. Verified with FFmpeg `silencedetect`: max pause is **0.91s**, with **zero** silences exceeding 1.5s.
5. **F07 Verification Gate:** Overall status **PASSED**, Score **92/100**, Verified **true**.

---

## 2. Technical Profile & Physical Measurements

| Metric | Target Specification | Physical Rendered Result | Verification Status |
|---|---|---|---|
| **Width × Height** | 1080 × 1920 (9:16) | 1080 × 1920 | **PASS (EXACT)** |
| **Duration** | 35.0s – 65.0s | 45.08s | **PASS (COMPLIANT)** |
| **Frame Rate** | 30.00 fps | 30.00 fps | **PASS** |
| **Video Codec** | H.264 (High Profile) | H.264 (yuv420p) | **PASS** |
| **Audio Codec** | AAC / PCM | AAC (Stereo, 44.1 kHz) | **PASS** |
| **File Size** | $< 15\text{ MB}$ | 1.14 MB (1,139,441 bytes) | **PASS** |
| **Max Silence** | $\le 1.0\text{s}$ | 0.913s | **PASS** |
| **Safe Areas** | Margins respected | Top 160px, Bottom 320px | **PASS** |
| **Watermark** | (940, 1800) | 88 × 88 PNG at (940, 1800) | **PASS** |

---

## 3. Scene Breakdown & Narrative Flow

| Beat ID | Scene Type | Start | End | Duration | Spoken Narration | Visual Primitive | Asset Reference |
|---|---|---|---|---|---|---|---|
| `beat_01` | HOOK | 0.00s | 4.70s | 4.70s | "The deepest point on Earth is so extreme it defies conventional oceanography." | `KINETIC_HOOK` | Blueprint Foundation |
| `beat_02` | FACT 1 | 4.70s | 15.19s | 10.49s | "At Challenger Deep, the sea floor plunges 10,994 meters down. Deep enough to submerge Mount Everest with two kilometers of water above its peak." | `IMAGE_WITH_CAPTION` | `mariana_depth_profile.png` |
| `beat_03` | STAT | 15.19s | 21.19s | 6.00s | "At this colossal depth, the hydrostatic water pressure reaches 1,086 bar." | `BIG_NUMBER` | Pressure Telemetry |
| `beat_04` | FACT 2 | 21.19s | 28.85s | 7.66s | "That pressure equals over one ton per square centimeter. Equivalent to having a heavy locomotive resting directly on your thumb." | `IMAGE_WITH_CAPTION` | `pressure_dial_1086bar.png` |
| `beat_05` | CLIMAX | 28.85s | 38.59s | 9.74s | "Yet life thrives here! The Mariana snailfish flourishes at eight thousand meters, using flexible cartilaginous skulls and protective molecules to survive." | `IMAGE_WITH_CAPTION` | `mariana_snailfish_abyss.png` |
| `beat_06` | OUTRO CTA | 38.59s | 45.01s | 6.42s | "Which fact surprised you most? Comment below and follow for more deep sea science discoveries." | `OUTRO_CTA` | Deep Indigo End Card |

---

## 4. Editorial & CMO Evaluation

- **Authority & Differentiation:** High-density technical blueprint aesthetic differentiates ShortForge from superficial AI-generated trivia channels.
- **Narrative Arc:** Moves logically from scale (10,994m) to physics (1,086 bar) to biology (snailfish adaptations), delivering a complete intellectual journey in 45 seconds.
- **Visual Evidence:** High-resolution vector diagrams fit the 920 × 680 safe card without distortion.
- **Verdict:** **QUALIFIED FOR COMMERCIAL DEPLOYMENT.**
