# ShortForge — Quiz Template V2 Design Specification
## `quiz.universal.cinematic.v2`

**Author:** Product Design Co-Lead & Motion Design Engineer  
**Status:** CANONICAL V2 SPECIFICATION  
**Target:** 9:16 Vertical Video (1080x1920) for YouTube Shorts, Instagram Reels, TikTok  
**Predecessor:** `quiz.universal.glass.v1` (Preserved 100% unchanged)

---

## 1. Architectural Principles

1. **Separation of Upstream & Downstream:**  
   The quiz engine maintains clean separation between factual research/curation (`UniversalQuizPayload`) and downstream visual composition (`NativeFrameCompositor` / Pillow / FFmpeg).
2. **Template V1 Preservation Invariant:**  
   `quiz.universal.glass.v1` is maintained verbatim as the stable fallback. All V2 enhancements are gated by `is_v2` and registered under the distinct canonical ID:
   ```ts
   'quiz.universal.cinematic.v2'
   ```
3. **Six Contextual Backgrounds Invariant:**  
   For any 6-question Short, 6 distinct question-relevant background images are loaded directly from the Backblaze B2 asset repository (`shortsfactory-assets/quiz-v2/`). Generic single-image loops are strictly prohibited.
4. **Soft Female Narration Invariant:**  
   Audio synthesis is driven by `Kore`, a soft, natural, friendly female narrator tone with warm frequency response and calm educator pacing.

---

## 2. Story Structure & Beat Lifecycle (20 Beats)

A canonical 6-Question ShortForge Quiz V2 video compiles into exactly 20 production beats:

```
[Beat 01] HOOK: Kinetic Hook & Topic Introduction (KINETIC_HOOK) ~3.5s
-----------------------------------------------------------------------
Question 1 Cycle:
  [Beat 02] Q1 Presentation (QUESTION_CARD) ~4.5s [B2 Bg: mariana_trench.png]
  [Beat 03] Q1 Suspense Countdown (COUNTDOWN) ~5.0s [Live Timer Bar]
  [Beat 04] Q1 Answer Reveal & Factoid (ANSWER_REVEAL) ~4.5s [Emerald Punch]
-----------------------------------------------------------------------
Question 2 Cycle:
  [Beat 05] Q2 Presentation (QUESTION_CARD) ~4.5s [B2 Bg: freshwater_lakes.png]
  [Beat 06] Q2 Suspense Countdown (COUNTDOWN) ~5.0s
  [Beat 07] Q2 Answer Reveal & Factoid (ANSWER_REVEAL) ~4.5s
-----------------------------------------------------------------------
Question 3 Cycle:
  [Beat 08] Q3 Presentation (QUESTION_CARD) ~4.5s [B2 Bg: mount_everest_himalayas.png]
  [Beat 09] Q3 Suspense Countdown (COUNTDOWN) ~5.0s
  [Beat 10] Q3 Answer Reveal & Factoid (ANSWER_REVEAL) ~4.5s
-----------------------------------------------------------------------
Question 4 Cycle:
  [Beat 11] Q4 Presentation (QUESTION_CARD) ~4.5s [B2 Bg: amazon_rainforest_basin.png]
  [Beat 12] Q4 Suspense Countdown (COUNTDOWN) ~5.0s
  [Beat 13] Q4 Answer Reveal & Factoid (ANSWER_REVEAL) ~4.5s
-----------------------------------------------------------------------
Question 5 Cycle:
  [Beat 14] Q5 Presentation (QUESTION_CARD) ~4.5s [B2 Bg: sahara_desert_dunes.png]
  [Beat 15] Q5 Suspense Countdown (COUNTDOWN) ~5.0s
  [Beat 16] Q5 Answer Reveal & Factoid (ANSWER_REVEAL) ~4.5s
-----------------------------------------------------------------------
Question 6 Cycle:
  [Beat 17] Q6 Presentation (QUESTION_CARD) ~4.5s [B2 Bg: tokyo_megacity_urban.png]
  [Beat 18] Q6 Suspense Countdown (COUNTDOWN) ~5.0s
  [Beat 19] Q6 Answer Reveal & Factoid (ANSWER_REVEAL) ~4.5s
-----------------------------------------------------------------------
[Beat 20] OUTRO: Call to Action & Comment Engagement (OUTRO_CTA) ~4.0s
```

**Total Planned Duration:** ~85s - 135s (Guaranteed within the 145.0s Shorts Ceiling).

---

## 3. Visual Layout & Safe Areas (1080x1920)

- **Header Safe Zone:** Y: 0 to 220px (Reserved for platform headers / search).
- **Category Badge:** Y: 292px to 346px, centered. Height: 54px.
- **Main Glass Card:** X: 80px to 1000px (Width: 920px), Y: 320px to 1380px (Height: 1060px).
  - Background: `#0B1220` with 97% opacity (`rgba(11, 18, 32, 248)`).
  - Border: 3px solid with dynamic category accent color.
- **Question Typography:** 38px Segoe UI / Arial Bold, pure white `#FFFFFF`.
- **Options List:** 4 stacked option boxes (Y offsets: 530, 655, 780, 905). Height: 105px each.
  - Option Label Badge (A, B, C, D): 52px circle with accent outline.
- **Countdown Progress Bar:** Continuous animated horizontal fill bar across the divider line.
- **Answer Reveal State:**
  - Correct Option: `#105F30` fill + `#34D399` border + 10px left emerald accent indicator + vector checkmark.
  - Incorrect Options: Softly dimmed to `#0D1424` (40% brightness).
- **Lower Third Subtitles:** Dedicated high-contrast rounded box at Y: 1490px, pure yellow `#FEF08A` text.
- **Branding Safe Zone:** ShortForge watermark placed at X: 940, Y: 1800 (Above platform controls).

---

## 4. Voice Persona Specification

- **Persona:** `Kore`
- **Gender:** Female
- **Tone Profile:** Soft, natural, conversational educator.
- **Acoustic Standards:**
  - Format: 16-bit Linear PCM Mono WAV (`audio/wav`).
  - Sample Rate: 22,050 Hz / 24,000 Hz.
  - Sibilance Control: Low-pass filter at 8.2 kHz, gentle +2.5 dB warmth boost at 250 Hz.
