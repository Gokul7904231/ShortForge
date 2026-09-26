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


## LIVE FACTORYOS CONNECTION

Obsidian is a client of the ShortForge Memory Fabric. The desktop application is not required by FactoryOS.

For local development, open the repository knowledge/ directory as the vault and enable only the documented core features. The live runtime bridge writes sanitized Markdown under knowledge/obsidian/.

To connect a FactoryOS runtime:

    MEMORY_FABRIC_ENABLED=true
    MEMORY_FABRIC_VAULT_PATH=<absolute path to repository>/knowledge

For production or headless environments, use a controlled filesystem target and an audited synchronization process. Never make public Publish or unreviewed community plugins part of the production execution path.

The runtime bridge can consume MongoDB change streams when supported by the deployment and always keeps a bounded reconciliation path as a correctness backstop.

## HEADLESS SYNC ADAPTER

ShortForge includes a small repository adapter for Obsidian Headless Sync.

    MEMORY_FABRIC_VAULT_PATH=<repo>/knowledge
    npm run obsidian:headless-sync
    npm run obsidian:headless-sync:continuous

Setup and login remain operator-managed. The adapter only forwards the configured vault path to the official headless client. Use one sync method per device.

## SHORTFORGE KNOWLEDGE GRAPH

The repository includes a dedicated Obsidian custom view at:

    knowledge/.obsidian/plugins/shortforge-knowledge-graph/

Enable **ShortForge Knowledge Graph** under Obsidian Community Plugins, then open:

    Command Palette → Open ShortForge Knowledge Graph

The graph is intentionally read-only. It reads vault links and semantic relation metadata and never writes runtime state.

The view reproduces the requested relation-graph interaction model: force motion, node drag, cursor-centered zoom, background pan, hover isolation, relation labels, Display/Forces controls, and direct note navigation.
