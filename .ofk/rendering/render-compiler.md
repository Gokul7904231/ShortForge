# Rendering: Render Compilers & Manifest Builders

> **Status**: OPERATIONAL  
> **Location**: `apps/web/lib/rendering/` & `apps/web/content-engines/`  

---

## 1. Responsibilities
- Translates dynamic content parameters (quiz questions, fact hooks, story dialogue) into deterministic scene graphs.
- Generates Remotion video bundle configurations with pixel-perfect text layouts and animated transitions.
- Assembles FFmpeg filter complexes when Remotion headless rendering is bypassed.
- Ensures identical inputs produce byte-consistent rendering instructions.
