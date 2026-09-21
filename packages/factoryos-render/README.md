# FactoryOS Render Engine (`factoryos-render`)

Deterministic local video execution engine for FactoryOS V3.

## Quick Start

```bash
pip install factoryos-render
factoryos-render doctor
factoryos-render render project.json
```

## Features
- **Deterministic Frame Clock**: $t = \text{frame} / \text{fps}$ with zero wall-clock dependencies.
- **Audio-First Timing**: Narration audio duration physically dictates scene timelines.
- **Durable Checkpoints & Resume**: Interrupted runs resume from the first incomplete stage.
- **Scene-Level Repair**: Re-render a single modified scene without rebuilding valid scenes.
- **Content-Addressed Caching**: Deterministic hashes guarantee zero duplicate rendering.
- **Atomic Commits**: Output is validated before renaming; never leaves corrupted MP4s.
