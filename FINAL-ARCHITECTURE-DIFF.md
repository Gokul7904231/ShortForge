# ShortForge Production Pipeline Remediation: Final Architecture Diff

- **Document ID:** `FINAL-ARCHITECTURE-DIFF-20261031`
- **Branch:** `feat/shortforge-production-pipeline-repair-20261031`
- **Base Commit:** `cf4cc2c9eae81e4e835a1c6ee8d7bc579868a6af`
- **Scope:** Architectural and data-flow comparison across pipeline generations (Run 1 vs Run 2 vs Remediated).

---

## 1. Architectural Generation Comparison Matrix

| System Subsystem | Run 1 (Original Baseline) | Run 2 (Intermediate Qualification) | Remediated ShortForge Pipeline (P0 Fixed) |
| :--- | :--- | :--- | :--- |
| **Narration Engine Defaults** | Attempted network TTS; uncaught exceptions broke pipelines. | Added `SilentWavVoiceEngine` as silent fallback; silently created 0-sample WAV containers. | **Strict Live TTS Requirement**: Silent fallback disabled by default. Throws `LIVE_PROVIDER_REQUIRED`. Explicit opt-in only. Rejects music/noise artifacts without transcripts. |
| **Audio Verification** | Container stream check only (`has audio stream == PASS`). | Container format checks only; false green on zero-sample silent WAVs. | **Physical PCM & FFmpeg Verification**: Binary inspection of 16-bit PCM samples (peak, RMS) + FFmpeg `volumedetect`. Rejects $\text{RMS}=0$. |
| **Narration Continuity** | Unchecked timeline offsets; drift between scenes. | Scene audio clips had undefined source-in offsets. | **Deterministic Lowering & Alignment**: Every scene audio track strictly pinned to `start_seconds: 0.0`, `source_in_seconds: 0.0`. Missing scene audio segments throw `ProductionNarrationIntegrityError`. |
| **Content Grounding** | Hardcoded claims: 84% unreplicable phenomena, 10x lithium density, modern astrophysics. | Still contained hardcoded strings; default topic inputs fell back to hardcoded text. | **Evidence Provenance Contract**: Strict input schemas (`FactsEvidenceInputs`, `QuizEvidenceInputs`, `HistoryEvidenceInputs`). Beats missing provenance fail closed. Zero topic leakage. |
| **Visual Framing** | Identical generic layout across formats. | Added unconditional purple orb `(70, 30, 110, 60)` to opaque scenes. | **Three Distinct Composition Families**: `QUIZ` (Navy/Gold cards), `FACTS` (Blueprint HUD grids), `HISTORY` (Archival amber borders). Orb strictly composition-controlled. |
| **Missing Visual Assets** | Replaced missing assets with generic text cards silently. | Rendered generic cards; asset failure was invisible to viewers. | **Observable Defect & Strict Production Gate**: Missing assets render observable warning on-frame in dev (`[OBSERVABLE DEFECT: MISSING ASSET]`) and throw `FileNotFoundError` in strict production. |
| **Captions & Safe Areas** | Raw text without background; low contrast on light backgrounds. | Basic text rendering with potential clipping. | **Dedicated Caption Container**: High-contrast dark pill (`rgba(5, 10, 20, 235)`), contrast $>15:1$, with $140\text{ px}$ top and $320\text{ px}$ bottom safe areas. |
| **Typography & Symbols** | Missing fonts caused `?` glyphs for checkmarks and quotes. | Font fallback issues on Unicode characters. | **Sanitized Unicode & Vector Primitives**: Checkmarks drawn via native vector paths; quotes/dashes normalized via `_sanitize_unicode()`. |
| **External Template Reuse** | None. | Cloned repos into `vendor/`, but adaptations were incomplete. | **Clean-Room Deterministic Lowering**: Mapped motion timing & styling from `RenderComp`, `procedural-film`, and `Paper-Cut` directly into native compositor. |

---

## 2. End-to-End Pipeline Data Flow

```mermaid
flowchart TD
    subgraph Topic & Factual Grounding Phase
        A[User Topic Input] --> B{Evidence Provided?}
        B -- No --> C[THROW FactualGroundingError: MISSING_TOPIC_EVIDENCE]
        B -- Yes --> D[Validate Provenance Schema]
        D --> E[TemplateProductionPipeline.generateTemplateScript]
        E --> F[ScriptIR: Grounded Beats & Provenance Attached]
        F --> F1{Validate Beats Provenance}
        F1 -- Missing Provenance on Factual Beat --> F2[FAIL: Script Validation Error]
        F1 -- Valid Provenance --> G[Script Validated]
    end

    subgraph Narration & Audio Integrity Phase
        G --> H[VoiceFabric.synthesize]
        H --> I{Primary Live TTS Configured?}
        I -- No & isProduction=true --> J[THROW LIVE_PROVIDER_REQUIRED: Silent Fallback Prohibited]
        I -- Yes --> K[Synthesize Audio via Gemini TTS / Provider]
        K --> L[VoiceFabric.validateAudibleAudio]
        L --> M{Physical RMS > 0 & Peak > -50dB?}
        M -- No --> N[THROW AudioSilenceDetectedError: Silent WAV Rejected]
        M -- Yes --> O{Audio Role Valid & Transcript Present?}
        O -- No: Music / Noise Only --> P[THROW ProductionNarrationIntegrityError: Role Invalid]
        O -- Yes --> Q{Max Narration Gap <= 0.8s?}
        Q -- No --> R[THROW ProductionNarrationIntegrityError: Gap Exceeded]
        Q -- Yes --> S[Audio Artifact Validated & Pinned to Offset 0.0]
    end

    subgraph Deterministic Composition & Rendering Phase
        S --> T[TemplateProductionPipeline.compileLocalRenderIntent]
        T --> T1{All Scene Audio Segments Present?}
        T1 -- Missing Segment --> T2[THROW ProductionNarrationIntegrityError: Segment Missing]
        T1 -- All Present --> U[LocalRenderAdapter -> Python NativeFrameCompositor]
        U --> V{Dispatch Format Family}
        V -- QUIZ --> W[_draw_quiz_card: Navy Background + Kinetic Reveal]
        V -- FACTS --> X[_draw_facts_blueprint: Technical Blueprint + Coordinate Grid]
        V -- HISTORY --> Y[_draw_history_archival: Layered Deckle Edge + Archival Quotes]
        W & X & Y --> Z[_draw_caption_container: High-Contrast Dark Pill]
        Z --> AA{All Required Assets Exist?}
        AA -- Missing & strict_production=true --> AB[THROW FileNotFoundError: Missing Asset]
        AA -- Missing & dev mode --> AC[Draw Observable Defect Box on Frame]
        AA -- Present --> AD[NativeFrameCompositor.render_frame]
    end

    subgraph Encoding & Forensic Verification Phase
        AD --> AE[FFmpeg Local Process Encode: MP4]
        AE --> AF[VoiceFabric.validateAudibleAudio on Final MP4]
        AF --> AG{Physical Audio Audible in MP4?}
        AG -- No --> AH[REJECT: Silent MP4 Video]
        AG -- Yes --> AI[Compute Actual SHA-256 Hash on Disk]
        AI --> AJ[Forensic Check: Hash == Manifest Hash]
        AJ --> AK[Review-Pack Complete: Gated for Owner Inspection]
    end
```

---

## 3. VoiceFabric State Machine & Production Gating

```mermaid
stateDiagram-v2
    [*] --> Init
    Init --> CheckConfig: synthesize(text, profile, options)
    
    state CheckConfig {
        [*] --> CheckProduction
        CheckProduction --> LiveRequired: isProduction=true && allowFallback=false
        CheckProduction --> FallbackAllowed: allowFallback=true (Dev Only)
    }

    LiveRequired --> PrimaryTTS: Invoke GeminiTTS / ElevenLabs
    PrimaryTTS --> NetworkError: Network / Credential Failure
    NetworkError --> FailClosed: THROW LIVE_PROVIDER_REQUIRED (Stop Pipeline)

    PrimaryTTS --> AudioOutput: Raw WAV / Stream Received
    AudioOutput --> PhysicalProbe: VoiceFabric.validateAudibleAudio(localPath)

    state PhysicalProbe {
        [*] --> InspectPCM: Read 16-bit PCM Samples
        InspectPCM --> CheckSilence: Peak Amplitude & RMS Calculation
        CheckSilence --> SilentDetected: RMS == 0 || Peak < 500
        SilentDetected --> RejectZero: THROW AudioSilenceDetectedError
        CheckSilence --> FFmpegVolumeDetect: Run volumedetect & silencedetect
        FFmpegVolumeDetect --> CheckGap: Max Silence Gap > 0.8s
        CheckGap --> GapError: THROW ProductionNarrationIntegrityError
        CheckGap --> ProbePass: Volume > -50dB & Gap <= 0.8s
    }

    ProbePass --> RoleCheck: Validate audioRole & transcript
    RoleCheck --> RejectMusic: audioRole == 'music' || transcript is empty
    RoleCheck --> IntentCompiler: Validated Non-Zero Speech Artifact
    IntentCompiler --> [*]
```

---

## 4. Visual Family & Compositor Dispatch Hierarchy

```mermaid
flowchart LR
    A[NativeFrameCompositor.render_frame] --> B{Inspect format_family / shot_recipe}
    
    subgraph QUIZ Family
        B -- format_family == 'QUIZ' --> Q1[_draw_quiz_card]
        Q1 --> Q2[Deep Navy Gradient Canvas: #050b1a to #0e1e38]
        Q2 --> Q3[Pill Container with Gold Accent Border]
        Q3 --> Q4[Vector Checkmark & High-Contrast Options > 15:1]
    end

    subgraph FACTS Family
        B -- format_family == 'FACTS' --> F1[_draw_facts_blueprint]
        F1 --> F2[Technical Blueprint Canvas: #07101e with Grid Overlay]
        F2 --> F3[Coordinate Markings & Axis Ticks]
        F3 --> F4[Radial Pressure Dial & Metric Progress Bars]
    end

    subgraph HISTORY Family
        B -- format_family == 'HISTORY' --> H1[_draw_history_archival]
        H1 --> H2[Archival Sepia/Amber Canvas: #120d09 to #241b12]
        H2 --> H3[Layered Deckle-Edge Borders from Paper-Cut]
        H3 --> H4[Eyewitness Quote Cards with Vignette Shadow]
    end

    subgraph Global Safe-Area Layer
        Q4 & F4 & H4 --> G1[Safe Area Guard: 140px Top, 320px Bottom]
        G1 --> G2[_draw_caption_container: rgba 5,10,20,235]
        G2 --> G3[ShortForge Proprietary Watermark Upper-Right]
    end
```

---

## 5. Summary of Architectural Invariants Enforced

1. **Deterministic Audio Honesty**: An audio stream header is no longer accepted as proof of speech. Audio must have non-zero RMS energy and peak amplitude verified at both intermediate WAV and final MP4 container stages. Ambient noise and music tracks without speech transcripts/alignments are rejected.
2. **Deterministic Factual Grounding**: No AI model or template generator may output topic-independent claims. Every statistic and historical quotation must originate from a verified `provenance` record.
3. **Deterministic Visual Distinction**: Quiz, Facts, and History must never share identical background styling or visual layouts. Missing required assets block production rendering under `strict_production: true`.
4. **Clean-Room License Boundary**: External templates (`RenderComp`, `procedural-film`, `Paper-Cut`) are adapted cleanly into ShortForge's native deterministic compositor without importing unverified third-party binaries or assets.
5. **Fail-Closed Verification Gates**: Missing credentials, zero-sample audio, missing evidence, missing narration segments, or hash mismatches immediately halt the production pipeline.
