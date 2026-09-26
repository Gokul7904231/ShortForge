# ShortForge Knowledge Graph

Dedicated Obsidian custom view for the ShortForge knowledge relation fabric.

## Behavior

- Force-directed motion.
- Drag nodes.
- Pan by dragging the background.
- Wheel zoom with cursor-centered zooming.
- Hover/select a node to isolate its relations.
- Double-click a node to open its note.
- Relation-aware edges and labels.
- Display controls: arrows, text fade threshold, node size, link thickness, Animate, Fit, Refresh.
- Force controls: center force, repel force, link force, link distance.
- Search and relation filters.
- Read-only: the graph never mutates runtime authority.

## Semantic relation metadata

~~~yaml
sf_relations:
  - relation: feeds
    target: "[[F03 AssetPlanIR]]"
  - relation: verified_by
    target: "[[F03 Verification Receipt]]"
~~~

Normal wikilinks are rendered as `links_to`. Existing `evidence_refs` become `verified_by`, and `sf_superseded_by` / `superseded_by` become `superseded_by`.

## Open

Command Palette → **Open ShortForge Knowledge Graph**

or the graph ribbon icon.

## Boundary

`.okf / runtime / evidence → knowledge/ → graph visualization`.

The graph is a navigation/visualization surface, not an authority or mutation surface.
