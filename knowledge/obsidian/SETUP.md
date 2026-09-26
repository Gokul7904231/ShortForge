---
id: shortforge-obsidian-setup
type: Reference
title: ShortForge Obsidian Setup
status: stable
sf_id: shortforge-obsidian-setup
sf_lifecycle: active
sf_epistemic_state: sourced
sf_verification_state: verified
created_at: 2026-09-26T00:00:00Z
updated_at: 2026-09-26T00:00:00Z
tags:
  - obsidian
  - setup
---

# ShortForge Obsidian Setup

## Open the vault

Open the repository's knowledge/ directory as an Obsidian vault.

## Enable core capabilities

Enable:
- Backlinks
- Bases
- Canvas
- Command palette
- Daily notes
- Graph view
- Outgoing links
- Page preview
- Properties view
- Search
- Templates
- Workspaces
- Sync only if used
- Web viewer

## Web Clipper

Install the official Obsidian Web Clipper extension and import:
- obsidian/clipper/shortforge-source.json
- obsidian/clipper/shortforge-github.json
- obsidian/clipper/shortforge-research.json

## Optional community extensions

Recommended only after review:
- Dataview — advanced metadata queries.
- Templater — advanced templates/automation.
- QuickAdd — structured capture commands.
- Excalidraw — visual architecture exploration.
- Obsidian Git — background Git operations.

ShortForge remains correct without these plugins.

## Dashboards

Open the .base files under obsidian/dashboards/.

## Canvas

Open obsidian/canvases/memory-fabric.canvas.

## CLI

On a developer machine with Obsidian installed:

~~~powershell
obsidian search query="F03"
obsidian search query="training_eligible"
obsidian read path="index.md"
~~~

## Headless automation

For controlled server-side automation, use Obsidian Headless Sync rather than installing the desktop application on a production runtime node.

## Git

Keep knowledge/ versioned with the ShortForge repository. Do not commit machine-specific workspace state.

## Publish

Publish only a deliberately curated public documentation subset. Never publish raw evidence, internal security material or training data by default.
