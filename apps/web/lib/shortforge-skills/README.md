# ShortForge Skill Engine — Docs Only

> **Status: docs-only.** No production code is wired yet. This directory holds ShortForge-native skill *definitions* extracted as methodology. The live pipeline (`apps/web` → `services/rendering-engine` → Cloudinary/Firestore) is untouched.

Location: `apps/web/lib/shortforge-skills/`
- Do NOT create `.claude/skills` — ShortForge owns its skills.
- Do NOT make production depend on Claude Code or external SKILL.md imports.
- External repo `shortforge-skills/` was not found on disk — these docs are native methodology per spec §1–4 license audit.

Skills (docs-only):
- `viral-hooks/` — curiosity/contrarian/authority/emotional/question/story/myth-busting/specificity/confession hooks, scored candidates
- `ai-video-storyboard/` — script → scene intent → continuity → shot → camera → lighting → subject → action → production prompt
- `video-analysis/` — optional reverse-engineering: hook/scene/retention/pacing/caption/visual profile
- `youtube-content/` — title/description/CTA/caption/hashtags, platform claims require evidence
- `shorts-production/` — 9:16 Shorts/Reels packaging, hook style, timing, renderer-compatible inputs

All future implementations must remain model-agnostic (via `IntelligentRouter`/`AIRuntime`), respect Basic 5-generation quota, and generate inputs for the canonical `RenderFabric`/`ComputeRouter` rendering plane and its provider adapters — never bypass the FactoryOS execution boundary.

License: repo-native MIT (see root `LICENSE`). No external code copied; methodology only.
