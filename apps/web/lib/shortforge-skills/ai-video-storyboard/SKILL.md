# ai-video-storyboard — ShortForge-native Skill (docs-only)

> No code integration. Methodology doc only. Existing RenderFabric / ComputeRouter / provider adapters / FFmpeg / Cloudinary pipeline unchanged — future engine would generate INPUTS only.

## Purpose
Turn a retention-aware script into a production-ready visual storyboard: visual theme, shot purpose, composition, camera, lighting, subject, action, continuity, timing, and 9:16 aspect handling — consumable by `create_short.py` without renderer changes.

## Current vs Target Behavior
- Current: `script sentence → imagePrompt`
- Target: `script → scene intent → visual continuity → shot composition → camera direction → lighting → subject → action → production prompt` (still emits `imagePrompt` + timing per scene so `job manifest → FactoryOS F06 → ComputeRouter → FFmpeg` stays intact).

## Inputs
- `script` (retention-structured: HOOK → OPEN LOOP → CONTEXT → ESCALATION → REVEAL → PAYOFF → CTA)
- `durationSeconds` (30–60, clamped), `aspectRatio` (default `9:16`)
- `style / tone / renderProfile` (`FAST_QUIZ`, `STANDARD_SHORTS` …)
- `engineSnapshot` / `contentType`
- Prior `scenes[]` if refining

## Outputs
- `storyboard: StoryboardScene[]` (count derived from duration, e.g. `ceil(duration/5)` or `duration/6`)
  - `id`, `text`, `imagePrompt` (production-ready, renderer-compatible)
  - `intent` (purpose of shot), `composition`, `camera` (push-in / orbit / tracking / handheld), `lighting`, `subject`, `action`, `continuityTag`
  - `timing: { startSec, durationSec }`, `aspectRatio`, `resolution` (e.g. 1080×1920)
- Continuity tokens (character/outfit/environment) propagated across scenes.

## Dependencies
- None at docs stage. Future runtime: `AIRuntime` / `IntelligentRouter` (model-agnostic, vision-aware when needed), capped `maxProviderCalls` / `maxRenderRetries` inside Basic quota.

## License
Repo-native MIT. External `shortforge-skills/ai-video-storyboard` not found on disk — no code copied, methodology only.

## Reusable Logic
- Intent → continuity graph → shot list → per-shot prompt synthesis.
- Camera/lighting vocabulary: rapid push-in, orbit, transformation cut, split-screen contrast, dramatic lighting shift, handheld energy.
- Prompt completeness validator (subject+action+composition+lighting present; no empty scenes).

## Pipeline Stage
Between `scriptAgent` / `validateContent` and job-manifest write; feeds `scenes[]` in `finalPayload` consumed by SQLite queue / Basic FastAPI / GitHub dispatch → `create_short.py`. No renderer rewrite.

## Constraints
- Model-agnostic, no hard-coded model IDs.
- Bounded calls, no unbounded image generation loops.
- Must output 9:16-safe prompts, correct scene count/timing, observation-mode QA later.
- No `.claude/skills`, no Claude dependency, no external shell scripts in Worker.
