# SHORTFORGE QUIZSHOW v1.1 — PRODUCTION DEFECT ROOT CAUSE FORENSIC REPORT
**Template**: `quiz.quizshow.v1`  
**Execution Context**: FactoryOS Core / Native Pillow & FFmpeg Render Engine  
**Mission Owners**: Technical Co-Lead, Senior Motion & Product Designer, Rendering Architect  
**Date**: November 1, 2026  
**Status**: ACCEPTANCE REVOKED (v1.0) -> ROOT CAUSES CONCLUDED -> REPAIR ARCHITECTURE SPECIFIED (v1.1)

---

## 1. Executive Summary & Incident Forensic Status

The preliminary acceptance of QuizShow v1 (`artifacts/quizshow-v1/quizshow-v1-universal-8q.mp4`) was revoked following forensic discovery of eleven distinct production defects. An automated F07 "PASS" verdict occurred solely because legacy verification gates checked coarse container metadata (container duration $\le 180.0\text{s}$, stream decodability, pixel geometry) while remaining completely blind to mid-sentence speech truncation, perceptual color contrast collapse, text line overflow, Russian-doll container borders, and missing subject imagery.

Four specialized subagents conducted bit-level forensic audits across the audio synthesis engine, video timeline compilation, image composition backends, and verification oracles. This report documents the exact root causes, mathematical formulations, line references, and remediation architecture for all eleven defects.

---

## 2. Complete Defect Forensics Matrix (Defects 1–11)

| Defect # | Observed Symptom | Forensic Mechanism & File/Line References | Mathematical / Algorithmic Proof | Resolution in v1.1 |
|:---|:---|:---|:---|:---|
| **Defect 1** | Intro title repeats "CHALLENGE" (`"ULTIMATE KNOWLEDGE CHALLENGE CHALLENGE"`) and is horizontally clipped. | **1.** `TemplateProductionPipeline.ts` (line 308) blindly concats `${topic.toUpperCase()} CHALLENGE`. When topic is `"Ultimate Knowledge Challenge"`, the string doubles.<br>**2.** `image.py` (lines 220–224) draws headline using raw unwrapped single-line `draw.text` with font size 52. | At font size 52, 39 characters span ~1170px. Safe canvas width is 920px (total 1080px). Text spills 45px outside both left and right edges.<br>In `KINETIC_HOOK` (line 230), `hook_text` evaluated `props.headline` instead of `props.subtitle`, duplicating the headline in the center. | **1.** Regex deduplication: `topic.endsWith('CHALLENGE') ? topic : topic + ' CHALLENGE'`.<br>**2.** Dynamic font downscaling (44pt $\rightarrow$ 28pt) and multiline bounded wrapping.<br>**3.** `KINETIC_HOOK` prioritizes `subtitle` for body typography. |
| **Defect 2** | Question presentation contains duplicated question-card borders. | `image.py` (lines 348–361) renders an outer container `[80, 420, 1000, 1550]` with 3px stroke, then an inner `q_box` `[100, 465, 980, 655]` with 2px stroke inset by only 20px, followed by option boxes with 2px strokes. | Creates a "Russian-Doll" nested border artifact with conflicting border radii (26px outer, 18px inner, 20px options) running parallel 20px apart. | Remove inner `q_box` container stroke. Question text sits directly on the card canvas, separated from options by a single subtle horizontal rule. |
| **Defect 3** | Question title, header, and captions overlap. | `image.py` lines 349, 354, 586:<br>- Card bottom: $y = 1550\text{px}$.<br>- Caption center: $y = 1540\text{px}$.<br>- Category pill width clamped to 420px while category title requires 636px. | 5-line question narration caption pill spans $y \in [1381, 1699]$. Caption pill overlaps lower 169px of card, cutting through options and explanation. Category text overflows pill by 95px on both sides. | **1.** Card height constrained: $Y_{\text{top}} = 320$, $Y_{\text{bottom}} = 1380$.<br>**2.** Caption zone: $Y = 1410 - 1570$ with 30px guaranteed clearance buffer.<br>**3.** Category pill dynamically sized to text width. |
| **Defect 4** | Countdown starts while narration is still speaking answer options. | `TemplateProductionPipeline.ts` (line 323) scripted narration reciting all 4 options verbatim (`Question 1 of 8: Which planet... Is it A: Jupiter, B: Venus, C: Mars, or D: Mercury?`). Speech duration was 10.9s–18.7s. Line 1170 scaled scene duration down to 8.3s–14.1s. | Scene video ended 2.6s–4.6s early. FFmpeg cut audio mid-sentence during options B/C. The player immediately switched to `beat_qi_countdown` which began ticking and speaking, interrupting options recitation. | Pacing redesign: Narrator speaks **ONLY** the question prompt in `beat_qi_card`. All 4 options are presented visually on high-contrast cards. Scene duration is bound to measured audio $+ 0.35\text{s}$, guaranteeing options recitation never collides with countdown. |
| **Defect 5** | Correct-answer reveal displays green selection state and checkmark without actual answer text. | **1.** `image.py` (line 481) drew correct option text with `fill=(34, 197, 94, 255)` (green) over green alpha fill `(34, 197, 94, 80)`.<br>**2.** `image.py` (line 432) ignored `shot_props.get("correctOption")`, reading only `shot_props.get("options")`. | Green-on-green luminance contrast ratio is $< 2.4:1$, collapsing completely under 8-bit YUV video compression. Text became invisible. When `options` array was omitted or defaulted, option strings fell back to placeholders. | **1.** Correct answer text rendered in pure white `#FFFFFF` (`(255, 255, 255, 255)`), achieving $> 12:1$ contrast ratio.<br>**2.** Explicit resolution of `shot_props.get("correctOption")` mapped into option slots. |
| **Defect 6 & 7** | Explanation narration cut before completion across all question cycles. | `TemplateProductionPipeline.ts` (lines 1167–1172) scaled all 26 scenes by `scaleFactor = 178.0 / 241.13 = 0.738191`. In `ffmpeg.py` (line 183), `atrim=duration={source_duration}` severed audio at the shortened video scene boundary. | Audio was compressed by 26.2% without audio time-stretching. Every reveal explanation lost its concluding words (e.g. Q1 lost `"...any planet in our Solar System."`; Q5 lost `"...of precisely 299,792,458 meters per second."`). | **Strict Audio Invariant**: Scene video duration must **NEVER** be shorter than physical audio duration ($T_{\text{video}} \ge T_{\text{audio}} + 0.35\text{s}$). Clamping is performed upfront on script word budget, never by truncating audio. |
| **Defect 8** | Final CTA text overlaps other content. | `image.py` (line 518) set outro card to fixed height 240px (`y = 800 - 1040`). `TemplateProductionPipeline.ts` passed 77-character subtitle string rendered unwrapped at font size 34. | 77 characters at size 34 requires 1540px width (canvas is 1080px). Text bled 460px outside screen edges and collided with the lower-third caption pill repeating the identical text. | Outro card height expanded to 320px. Subtitle wrapped and bounded. Distinct, concise visual CTA (`"COMMENT YOUR SCORE!"`, `"Did you get 8/8 right?"`) separated from spoken narration. |
| **Defect 9** | Final "subscribe" instruction missing or truncated in narration. | In `scene_26_beat_outro_cta`, physical narration was 5.03s (`"...Comment your score below and subscribe!"`). Line 1170 scaled scene to 3.97s. | Audio lost 1.06s. FFmpeg cut the audio right after `"Comment your..."`, eliminating `"score below and subscribe!"`. | Outro scene duration set to `audio_duration + 0.50s` (natively ~5.5s), guaranteeing complete speech delivery. |
| **Defect 10** | Subject-related background imagery does not appear. | Three-tier disconnect:<br>1. `TemplateProductionPipeline.ts` dropped image references from `props`.<br>2. `ShotRecipeLibrary.ts` declared `assetRequirements: []`.<br>3. `image.py` quiz shot recipes never checked `image_path` (only fallback `else:` checked it). | Compositor had zero image loading logic for `QUESTION_CARD`, `COUNTDOWN`, or `ANSWER_REVEAL`. Frames fell back to procedural gradient backgrounds. | **1.** Asset paths propagated through pipeline.<br>**2.** Dedicated atmospheric subject backdrop layer loaded, fitted (1080x1920), blurred, and dark-scrimmed behind quiz cards across all question beats. |
| **Defect 11** | Output duration reported as 178.24s exceeded internal 178.0s production guard. | Compounding quantization errors across 26 concatenated scenes:<br>1. 30fps Frame Clock half-up rounding accumulated to 5,343 frames (178.100s).<br>2. 22,050Hz AAC packetization (46.44ms/packet) accumulated 26 priming delays and padding frames during `-c copy` concatenation to 178.236553s. | MP4 container duration is `max(video_dur, audio_dur) = 178.24s`. Since $178.24 > 178.0$, it violated the internal guard. | **1.** Production budget ceiling lowered to $\le 175.00\text{s}$ (target 168–170s).<br>**2.** Frame-quantized timeline: scene durations quantized to exact $N/30$ frames.<br>**3.** Hard container clamp at concat level. |

---

## 3. Mathematical Duration & Truncation Forensics Ledger

The following bit-level data was extracted by Agent A directly from the physical WAV files and render checkpoint cache of `SF-QUIZSHOW-V1-UNIVERSAL-8Q`:

$$\text{Total Physical Spoken Audio} = 232.006\text{s}$$
$$\text{Total Unconstrained Timeline (with }+0.35\text{s padding)} = 241.130\text{s}$$
$$\text{Applied Scaling Factor} = \frac{178.0}{241.13} \approx 0.738191$$
$$\text{Aggregate Audio Lost to Truncation} = 54.02\text{ seconds (22.4% of all speech lost!)}$$

| # | Scene ID | Spoken Text Snippet | WAV Dur | Scaled Plan | Rendered MP4 | Audio Lost | Severed Speech |
|---|---|---|---|---|---|---|---|
| **01** | `scene_01_beat_01_hook` | 8-question challenge hook | 6.96s | 5.40s | 5.400s | -1.56s | `...ultimate Knowledge Challenge challenge?` |
| **02** | `scene_02_beat_q1_card` | Q1 Jupiter prompt & options | 10.89s | 8.30s | 8.300s | -2.59s | `...Venus, C: Mars, or D: Mercury?` |
| **03** | `scene_03_beat_q1_countdown` | 5s countdown suspense | 3.34s | 2.72s | 2.733s | -0.60s | `...your answer!` |
| **04** | `scene_04_beat_q1_reveal` | Answer Jupiter + explanation | 9.33s | 7.15s | 7.167s | -2.17s | `...any planet in our Solar System.` |
| **05** | `scene_05_beat_q2_card` | Q2 Mariana Trench options | 13.30s | 10.08s | 10.080s | -3.22s | `...C: Puerto Rico Trench, or D: Java Trench?` |
| **06** | `scene_06_beat_q2_countdown` | 5s countdown suspense | 3.34s | 2.72s | 2.733s | -0.60s | `...your answer!` |
| **07** | `scene_07_beat_q2_reveal` | Answer Mariana + explanation | 10.34s | 7.89s | 7.890s | -2.45s | `...10,994 meters below sea level.` |
| **08** | `scene_08_beat_q3_card` | Q3 Pyramids options | 13.51s | 10.23s | 10.233s | -3.28s | `...C: Persian Empire, or D: Mycenaean Greece?` |
| **09** | `scene_09_beat_q3_countdown` | 5s countdown suspense | 3.34s | 2.72s | 2.733s | -0.60s | `...your answer!` |
| **10** | `scene_10_beat_q3_reveal` | Answer Egypt + explanation | 9.85s | 7.53s | 7.533s | -2.32s | `...Old Kingdom era around 2560 BCE.` |
| **11** | `scene_11_beat_q4_card` | Q4 Transformer options | 14.78s | 11.17s | 11.170s | -3.61s | `...C: Convolutional Network, or D: Boltzmann Machine?` |
| **12** | `scene_12_beat_q4_countdown` | 5s countdown suspense | 3.34s | 2.72s | 2.733s | -0.60s | `...your answer!` |
| **13** | `scene_13_beat_q4_reveal` | Answer Transformer + expl | 9.11s | 6.98s | 7.000s | -2.11s | `...the Transformer, powering all modern LLMs.` |
| **14** | `scene_14_beat_q5_card` | Q5 Speed of light options | 18.72s | 14.08s | 14.080s | -4.64s | `...km/s, C: 30,000 km/s, or D: 3,000 km/s?` |
| **15** | `scene_15_beat_q5_countdown` | 5s countdown suspense | 3.34s | 2.72s | 2.733s | -0.60s | `...your answer!` |
| **16** | `scene_16_beat_q5_reveal` | Answer 300k km/s + expl | 14.72s | 11.12s | 11.133s | -3.58s | `...of precisely 299,792,458 meters per second.` |
| **17** | `scene_17_beat_q6_card` | Q6 Freshwater lakes options | 12.58s | 9.54s | 9.567s | -3.01s | `...B: Russia, C: United States, or D: Finland?` |
| **18** | `scene_18_beat_q6_countdown` | 5s countdown suspense | 3.34s | 2.72s | 2.733s | -0.60s | `...your answer!` |
| **19** | `scene_19_beat_q6_reveal` | Answer Canada + expl | 8.90s | 6.83s | 6.833s | -2.07s | `...the rest of the world combined.` |
| **20** | `scene_20_beat_q7_card` | Q7 Apollo 11 options | 15.38s | 11.61s | 11.610s | -3.77s | `...1969, B: 1965, C: 1971, or D: 1973?` |
| **21** | `scene_21_beat_q7_countdown` | 5s countdown suspense | 3.34s | 2.72s | 2.733s | -0.60s | `...your answer!` |
| **22** | `scene_22_beat_q7_reveal` | Answer 1969 + expl | 10.35s | 7.90s | 7.900s | -2.45s | `...Tranquility Base on July 20, 1969.` |
| **23** | `scene_23_beat_q8_card` | Q8 GPU processor options | 12.77s | 9.69s | 9.690s | -3.08s | `...B: General, C: Global, or D: Grid?` |
| **24** | `scene_24_beat_q8_countdown` | 5s countdown suspense | 3.34s | 2.72s | 2.733s | -0.60s | `...your answer!` |
| **25** | `scene_25_beat_q8_reveal` | Answer Graphics + expl | 8.79s | 6.75s | 6.767s | -2.02s | `...suited for high-throughput tensor math.` |
| **26** | `scene_26_beat_outro_cta` | Scoreboard + Subscribe CTA | 5.03s | 3.97s | 3.970s | -1.06s | `...score below and subscribe!` |

---

## 4. Bounding Box & Collision Resolution Ledger

To guarantee zero overlaps, the 1080x1920 layout is strictly zoned:

```
Y = 0 ────────────────────────────────────────────────────────
      SAFE TOP (System bar cushion) [0 - 160px]
Y = 160 ──────────────────────────────────────────────────────
      Headline Area: Y = 175 - 235 (Height: 60px, Auto-Scaled Font 40-44px)
Y = 245 ──────────────────────────────────────────────────────
      Category Pill: Y = 250 - 304 (Height: 54px, Auto-Padded to text)
Y = 320 ──────────────────────────────────────────────────────
      ┌────────────────────────────────────────────────────────┐
      │ UNIFIED QUESTION CARD CONTAINER (Y = 320 - 1380px)     │
      │ Width: 920px [Left: 80, Right: 1000] | Height: 1060px  │
      │ Fill: #0B1220 @ 97% | Stroke: Accent 2px               │
      │                                                        │
      │ [Question Prompt Area] (Y = 350 - 490px, Height: 140px)│
      │ Pure White #FFFFFF, Auto-Wrapped, No Inner Box Stroke  │
      │                                                        │
      │ ── Thin Horizontal Accent Rule (Y = 510px) ───────────│
      │                                                        │
      │ [Option A] Y = 540 - 650px  (Height: 110px)           │
      │ [Option B] Y = 670 - 780px  (Height: 110px)           │
      │ [Option C] Y = 800 - 910px  (Height: 110px)           │
      │ [Option D] Y = 930 - 1040px (Height: 110px)           │
      │                                                        │
      │ [Explanation Box (Reveal State Only)]                  │
      │ Y = 1070 - 1340px (Height: 270px)                      │
      └────────────────────────────────────────────────────────┘
Y = 1380 ─────────────────────────────────────────────────────
      GUARANTEED CLEARANCE AIR GAP: Y = 1380 - 1410px (30px)
Y = 1410 ─────────────────────────────────────────────────────
      REPAIRED LOWER THIRD CAPTION ZONE: Y = 1410 - 1570px (160px)
      2-line condensed speech subtitles (Yellow on Dark Pill)
Y = 1600 ─────────────────────────────────────────────────────
      SAFE BOTTOM (YouTube Shorts UI Engagement Zone) [1600 - 1920px]
      Watermark: (940, 1800)
Y = 1920 ─────────────────────────────────────────────────────
```

---

## 5. Architectural Correctness Guarantees

1. **Audio Integrity Guarantee**: Audio duration strictly drives scene duration. Scene video duration is dynamically calculated as:
   $$T_{\text{video}}[i] = \text{round}\left(\left(T_{\text{audio}}[i] + 0.35\right) \times 30\right) / 30$$
   Speech is never cut off.
2. **Pacing Balance**: By narrating only the question prompt and displaying options visually, speech per question drops from ~16s to ~6.5s. 8 questions $\times (6.5\text{s question} + 4.0\text{s countdown} + 7.5\text{s reveal}) + 4.0\text{s hook} + 4.5\text{s outro} \approx 152.5\text{s}$, sitting comfortably below the 175.0s production ceiling.
3. **WCAG Compliance**: Correct option card renders pure white `#FFFFFF` text on emerald green pill/border, achieving an $11.8:1$ contrast ratio.
4. **Subject Grounding**: Authentic visual domain imagery (NASA, NOAA, NIST, NeurIPS) is loaded and composited for every question beat.

