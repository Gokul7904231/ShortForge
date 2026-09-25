# shorts-production — ShortForge-native Skill (docs-only)

> No code integration. Methodology doc only. Generates INPUTS for existing renderer — never rewrites RenderFabric / ComputeRouter / provider adapters / FFmpeg / Cloudinary.

## Purpose
Optimize 9:16 short-form packaging and production plan for YouTube Shorts / Instagram Reels / TikTok / Facebook Reels: hook style, pacing, caption/hashtag strategy, title/description/CTA, and render-safe timings — while staying inside the existing `ShortForge Control Plane → FactoryOS mission → F06 RenderFabric → ComputeRouter → physical artifact → F07 → delivery` pipeline.

## Inputs
- `topic`, `contentType` (`QUIZ_SHORTS` | `MOTIVATIONAL` | `FACTS` …)
- `platform` (`youtube-shorts` | `reels` | `tiktok` | `facebook-reels`)
- `targetDurationSeconds` (30–60, clamped), `aspectRatio` (`9:16` default), `renderProfile`
- `tone`, `style`, `engineSnapshot`
- Optional `storyboard` / `videoAnalysis` (when available)

## Outputs
- `productionPlan: ShortsProductionPlan` (renderer-compatible inputs only)
  - `hookStyle` (one of 9 hook types + rationale, feeds `HOOK` beat)
  - `structure` (HOOK → OPEN LOOP → CONTEXT → ESCALATION → REVEAL → PAYOFF → CTA, duration-fitted)
  - `scenePlan`: `count`, per-scene `durationSec` (4–8s), `timing` (startSec), `aspectRatio`/`resolution` (e.g. 1080×1920)
  - `promptGuidance` (composition/camera/lighting/subject/action knobs for `imagePrompt` synthesis — no renderer rewrite)
  - `packaging`: `title` / `description` / `cta` / `captionStrategy` / `hashtags[5..10]` (reuses youtube-content contracts)
  - `platformPackaging` (safe zones, caption line breaks, duration fit — advisory)
- All outputs become `scenes[]` / manifest fields consumed by SQLite queue → Basic FastAPI / GH Actions → `create_short.py`.

## Dependencies
- None at docs stage. Future runtime: `AIRuntime` via `IntelligentRouter` (model-agnostic), bounded `maxProviderCalls` / `maxRenderRetries`, inside Basic 5-generation quota.

## License
Repo-native MIT. External `shortforge-skills/shorts-production` not found on disk (recursive sweep returned zero hits) — no code copied, methodology only.

## Reusable Logic
- Duration → scene-count/timing solver (e.g. `ceil(duration/5)` with 4–8s per scene clamp).
- 9:16 composition/camera vocabulary (push-in, orbit, tracking, handheld, transformation cut, split-screen).
- Title/hashtag validators (≤60 char title, 5–10 hashtags, no generic titles, no unverified viral claims).
- Platform matrix (Shorts vs Reels vs TikTok) for advisory packaging only.

## Pipeline Stage
Between script/validation and manifest write: `topic → hook → retention script → shorts production plan → ai-video-storyboard → scenes[] → saveJobManifest → queue → create_short.py`. Optional — Basic queued path works without it.

## Constraints
- DO NOT rewrite renderer (Azure VM / basic-fastapi / create_short.py / FFmpeg / Cloudinary stay unchanged).
- Model-agnostic, no hard-coded model IDs; cost-safe (bounded calls, quota-respecting).
- Observation-mode QA later; no auto-rejection on arbitrary thresholds.
- No `.claude/skills`, no Claude dependency, no new paid infra (Workers AI / R2 / KV / D1 / Queues / DO).
- No external shell scripts executed from Worker/Azure without review.
