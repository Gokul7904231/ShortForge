# video-analysis — ShortForge-native Skill (docs-only)

> No code integration. Methodology doc only. Optional capability — normal Basic generation must never depend on it. No yt-dlp / ffmpeg scripts wired into production.

## Purpose
Reverse-engineer a reference video into actionable ShortForge inputs: hook profile, scene-change map, transcript/retention beats, pacing, caption style, and visual style — so a new generation plan can be derived without copying the source.

## Inputs
- `referenceVideo` (optional URL or uploaded file — local analysis path; not auto-fetched in production without allowlist)
- `analysisOptions` (which lenses: hook | scenes | transcript | retention | pacing | caption | visual)
- `targetTopic` (to map analysis onto a new ShortForge generation, optional)

## Outputs
- `analysis: VideoAnalysis`
  - `hookProfile` (type, first-3s text, curiosity/retention signals)
  - `sceneChanges[]` (timestamps, shot purpose, transition type)
  - `transcript` (time-aligned, optional)
  - `retentionBeats[]` (HOOK → OPEN LOOP → CONTEXT → escalation points → REVEAL → PAYOFF → CTA mapping)
  - `pacingProfile` (cuts per minute, sentence length, silence ratio)
  - `captionProfile` (style, emphasis, timing, line breaks)
  - `visualProfile` (palette, lighting, composition, camera vocabulary, aspect ratio 9:16 vs detected)
  - `generationPlan` (recommended hook type, structure, storyboard knobs — renderer-compatible; does not itself render)

## Dependencies
- None at docs stage. Future runtime: optional local ffprobe/transcript service behind allowlist/host checks; never fetch arbitrary URLs via SSRF-vulnerable path (see security note re `publishing/providers/youtube.ts` — must allowlist storage hosts, block private ranges, DNS-validate, manual redirects).

## License
Repo-native MIT. External `shortforge-skills/video-analysis` not found on disk — no code copied, methodology only.

## Reusable Logic
- Scene-change detection (thresholded histogram / ffprobe) → shot list.
- Transcript → retention-beat identification (gap, escalation, reveal).
- Pacing analysis (cut frequency, words-per-second, silence detection).
- Caption/visual style clustering for packaging guidance.
- Guard: if analysis unavailable, generation falls back to viral-hooks + retention + storyboard defaults.

## Pipeline Stage
Standalone optional pre-generation tool: `reference video → analysis → hook/pacing/visual profile → ShortForge generation plan` → then normal `POST /api/generate-video` flow. Never on the mandatory Basic path (5-generation quota path stays analysis-free).

## Constraints
- Optional, not a dependency of `tier=BASIC` queued → FactoryOS F06 → provider → Cloudinary flow.
- No auto-integration of external `yt-dlp` / ffmpeg shell scripts into worker/provider.
- Bounded calls, model-agnostic when LLM assists (via `IntelligentRouter`).
- No `.claude/skills`, no Claude dependency.
