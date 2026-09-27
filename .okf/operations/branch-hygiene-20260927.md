# Branch Hygiene Closure — 2026-09-27

## Result

The live repository was audited against main, including branch-to-main commit divergence and associated pull requests.

### Retained branches

| Branch | Reason |
|---|---|
| `main` | Canonical production branch |
| `feat/floor05-pretraining-hardening-wave3-20260927` | Closed PR #35 contains unique unmerged Floor 05 implementation work; retained as a review/archive candidate rather than silently deleting potentially useful architecture |
| `research/movie-intelligence-wave1` | Unique research-only `.okf` material for future Movie Intelligence work; retained as a research archive |

### Deleted branches

- `feat/f03-runtime-adapter`
- `feat/floor04-production-hardening-20260926`
- `feat/floor05-pretraining-upgrade-20260927`
- `feat/floor05-wave2-pretraining-completion-20260927`
- `feat/floor06-pretraining-hardening-20260927`
- `feat/obsidian-live-memory-fabric-20260926`
- `feat/obsidian-memory-fabric-20260926`
- `feat/shortforge-knowledge-graph-20260926`
- `feat/temporal-precision-wave2-20260927`
- `feat/temporal-template-precision-20260927`

### Knowledge Graph preservation

The merged Knowledge Graph implementation was already present on main, while its branch had the only remaining `knowledge/.obsidian/community-plugins.json`. That plugin-enable file was promoted to main before branch deletion.

### Safety rule used

A branch was deleted only when its production changes were already represented in main, or it was an explicitly superseded/closed implementation branch with no approved canonical runtime change remaining.

Unique unmerged implementation/research branches were retained.

## Current branch count

**3 branches total:**

- `main`
- `feat/floor05-pretraining-hardening-wave3-20260927`
- `research/movie-intelligence-wave1`

Repository setting `delete_branch_on_merge` remains disabled, so future merged branches may continue to remain until explicitly cleaned.