# ShortForge Global Assets Architecture

This directory serves as the **single canonical source of truth** for all visual, branding, avatar, theme, and content assets across the ShortForge monorepo.

---

## 1. Directory Taxonomy

```text
assets/
├── branding/          # Official logos, watermarks, and favicons
│   ├── favicon.ico
│   ├── favicon-white.png
│   ├── favicon-black.png
│   ├── logo.png
│   └── shortforge-watermark.png
├── icons/             # Universal UI and SVG icons
│   ├── file.svg
│   ├── globe.svg
│   ├── next.svg
│   ├── vercel.svg
│   └── window.svg
├── backgrounds/       # Global render engine photographic backdrops
│   ├── geography_theme.png
│   ├── india_theme.png
│   ├── science_theme.png
│   ├── sports_theme.png
│   └── world_theme.png
├── avatars/           # AI persona expressions and character sheets
│   └── overseer/      # Overseer supervisor facial reactions (normalized kebab-case)
│       ├── alert-face.png
│       ├── concerned-face.png
│       ├── dark-theme-base.png
│       ├── expression-ref-sheet.png
│       ├── happy-face.png
│       ├── light-theme-base.png
│       ├── neutral-face.png
│       ├── playful-laughing-face.png
│       ├── surprised-face.png
│       └── thinking-face.png
├── content/           # Curated domain content assets used by production engines
│   ├── facts/         # Facts format (e.g., Mariana Trench depth profiles)
│   ├── history/       # History format (e.g., Apollo 11 mission imagery)
│   └── quiz/          # Universal QuizShow domain assets (Science, AI, History, Geography)
└── samples/           # Canonical test posters and reference frames
    ├── german-quiz-frame0.jpg
    ├── german-quiz-poster.jpg
    └── german-quiz.mp4
```

---

## 2. Ingestion & Repathing Guidelines

1. **Deterministic File Naming**:
   - All filenames must use strictly lower-case kebab-case (`kebab-case.png`) or snake-case (`snake_case.png`).
   - Whitespace and special characters are forbidden.

2. **Web Application Serving (`apps/web/public/`)**:
   - Next.js requires static public files to reside in `apps/web/public/`.
   - The canonical master files live in `assets/branding/` and `assets/icons/`.
   - To keep them in sync, run `npm run sync:assets` (or `python tools/sync_assets.py`).

3. **Rendering Engines**:
   - `services/rendering-engine` and `packages/factoryos-render` resolve assets via `repo_root / "assets" / ...`.
   - Watermarks resolve from `assets/branding/shortforge-watermark.png`.
   - Subject backdrops resolve from `assets/backgrounds/{theme}.png` and `assets/quiz/{category}/{asset}.png`.

4. **GitHub & Markdown Integration**:
   - In repository markdown files (e.g., `README.md`), reference assets via relative paths:
     `<img src="assets/branding/logo.png" width="96" alt="ShortForge Logo" />`

