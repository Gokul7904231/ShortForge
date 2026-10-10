# .okf Agent-Efficiency Restructure — Design Spec

- **Date:** 2026-10-10
- **Status:** DRAFT (pending user review)
- **Scope:** `.okf/` corpus interface only — index, metrics, playbooks, format standard, canonical conversions
- **Classification (per `decision-protocol.md` §5):** extends existing rule (extends `OKF.PROCESS.FULL_SWEEP` + machine sweep binding with metrics evidence; no locked rule rewritten, no silent drift)
- **Out of scope:** changing any locked rule, audit, or decision content; changing `decision-protocol.md` sweep duty; touching executable implementation or tests

## 1. Problem

`.okf` rates 6/10 across five lenses (full rating in conversation, 2026-10-10):

| Lens | Score | Binding constraint |
|---|---|---|
| Product Designer | 5/10 | No progressive disclosure; `index.md` ~20 rows for 249 files |
| Product Engineer | 6/10 | No doc-health CI; `decisions/` has no ledger view; sweep is O(corpus) |
| Principal AI Architect | 7/10 | Authority sound but hard to discover; rule coverage PILOT (6 rules) vs 100%-critical target, unmeasured |
| Senior AI Engineer | 5/10 | No frontmatter standard; prose-first bodies; 91 repo-mappings with zero triage metadata; no corpus stats |
| Strategic AI Agent Dev Lead | 5/10 | Zero task-oriented entry points; no onboarding ramp; no sweep-completion feedback |

Authority and depth are a 7; agent interface is a 5. Fix the interface, don't touch the authority.

## 2. Locked decisions

| Decision | Ruling |
|---|---|
| Conversion depth | **Hybrid:** new index/metrics/playbooks/format-standard now; table-first rewrite of root + `security/` + `hierarchy/` canonicals; all other prose converts on-touch |
| Metrics upkeep | **Script-generated:** `tools/okf/corpus-metrics.py` regenerates `metrics.md`; never hand-edited |
| Architecture | **B — Layered router:** thin `index.md` (~2k tokens) + satellites, not a mega-index or JSON-first rewrite |

## 3. Design conventions (dev-community grounding)

- **llms.txt pattern** ([llmstxt.org](https://llmstxt.org/)): compact annotated link map; detail behind links, fetched on demand. Realized as the `index.md` routing table.
- **AGENTS.md pattern** ([agents.md](https://agents.md/)): README-for-agents with validation + safety guidance, nested near governed code. Realized as `playbooks/`.
- **Progressive disclosure:** YAML frontmatter on every converted file for triage-without-reading; table-first bodies; prose only as annotated rows.

## 4. Components

| # | Artifact | Change | Owner |
|---|---|---|---|
| 1 | `.okf/index.md` | Rewrite as routing table (§5) | Hand |
| 2 | `.okf/metrics.md` | New; script-generated corpus health (§6) | `tools/okf/corpus-metrics.py` |
| 3 | `.okf/playbooks/` | New; 5 task checklists (§7) | Hand |
| 4 | `.okf/format-standard.md` | New; frontmatter + table contract (§8) | Hand |
| 5 | Canonical conversions | Table-first rewrite: root (`architecture.md`, `hierarchy-map.md`, `principles.md`, `terminology.md`, `engineering-stack.md`), `security/*`, `hierarchy/*` | Hand |
| 6 | `tools/okf/corpus-metrics.py` + CI hook | New script; CI fails on broken links, warns on out-of-scope missing frontmatter | Code |

`audits/`, `decisions/`, and `research/repo-mappings/` content is **not rewritten** (locked historical evidence per protocol §9). Repo-mappings get triage frontmatter only (`assimilation: adopted | rejected | reference`).

## 5. `index.md` router schema

One row per `.okf/` directory + root canonical group (~22 rows). Exact columns:

| Domain | Entry file | Files (N) | Read when | Sweep step |
|---|---|---|---|---|

- `Sweep step` references `decision-protocol.md` §2 step numbers — the protocol stays authoritative; the index only points.
- `Files (N)` is refreshed by the metrics script alongside `metrics.md`.
- Budget: whole file reads in ~2k tokens. No prose sections; one-line header stating read path: index → domain entry → playbook (only if acting).

## 6. `metrics.md` schema

Header: `GENERATED — do not hand-edit. Source: tools/okf/corpus-metrics.py. Regenerate: python tools/okf/corpus-metrics.py`. Sections:

| Section | Content |
|---|---|
| Corpus size | Total `.md` files; per-domain counts; largest 5 files by tokens |
| Freshness | Newest/oldest `updated` frontmatter dates; files missing `updated` |
| Structure coverage | % files with valid frontmatter; % converted to table-first (in-scope vs on-touch) |
| Link health | Broken internal links (CI-failing); orphan files with zero inbound links |
| Rule coverage | Rules in `rules/index.json` by status; machine-rule count vs 100%-critical target |
| Triage | Repo-mappings by `assimilation` value; `decisions/` count; open contradictions listed (none if clean) |

## 7. Playbooks

Five files in `.okf/playbooks/`, all following this template:

```markdown
# Playbook: <task>
Purpose | Rule IDs | Minimal sweep subset (protocol §2 steps) | Checklist | Evidence outputs | Done criteria
```

| Playbook | Rule IDs | Minimal sweep |
|---|---|---|
| `new-decision.md` | FULL_SWEEP, TEAM_GATE | Steps 0–4, 12–15 (domain sections as applicable) |
| `security-change.md` | LEAST_PRIVILEGE, TEAM_GATE | Steps 0–4 + production-helper |
| `rendering-change.md` | F07_VERIFIED, TEAM_GATE | Steps 0–3, 7, 12–15 + production-helper |
| `add-repo-mapping.md` | FULL_SWEEP (repo-mapping rule §5) | Steps 6, 11 + clean-room note |
| `release.md` | F07_VERIFIED, UNPROVEN_NOT_PASS | Steps 12–15 + release attestation |

Playbooks **reference** rule IDs — they never restate rule text. If a rule changes, no playbook edit is needed.

## 8. Format standard (`format-standard.md`)

Required frontmatter for every converted file:

```yaml
---
domain: security            # .okf/ subdirectory
title: Worker Permissions & Capability Matrix
class: canonical_contract   # one of manifest.yaml truth_domains
status: ACTIVE              # one of manifest.yaml lifecycle_states
sweep_step: 4               # decision-protocol.md §2 step
owner: Human/Overseer
rules: [OKF.SECURITY.LEAST_PRIVILEGE]   # rules/index.json IDs or []
updated: 2026-10-10
---
```

Body rules: tables before prose; ASCII diagrams get a companion table restating nodes/edges; truth tags (`IMPLEMENTED`…`PLANNED`, protocol §10) on every architectural claim; no new `Document Class` values beyond existing ones.

## 9. Metrics script (`tools/okf/corpus-metrics.py`)

- Walks `.okf/**/*.md`; parses frontmatter; extracts internal links; token-estimates bodies.
- Reads `rules/index.json` for rule coverage; reads `manifest.yaml` for valid enum values.
- Writes `.okf/metrics.md` + refreshes `Files (N)` column in `.okf/index.md`.
- Exit codes: `1` on broken internal links or invalid frontmatter enums (CI-failing); `0` with warnings section for missing frontmatter outside conversion scope.
- Follows existing `tools/okf/` conventions (`sweep.py`, `validate_report.py`).

## 10. Agent read path (data flow)

```
decision needed
  → index.md (~2k tokens): find domain row + sweep step
  → domain entry file: tables first, prose only if needed
  → playbook (only if acting): checklist + rule IDs + minimal sweep subset
  → rules/index.json: machine applicability
  → metrics.md (only if judging corpus trust): staleness, coverage
```

Full-sweep duty is unchanged; each hop becomes O(1) instead of O(corpus).

## 11. Files touched

New: `.okf/metrics.md`, `.okf/format-standard.md`, `.okf/playbooks/*.md` (5), `tools/okf/corpus-metrics.py`, CI hook edit.
Rewritten: `.okf/index.md`, root canonicals (5), `security/*` (6), `hierarchy/*` (10), repo-mapping frontmatter only (91, metadata-only edit).
Untouched: `decision-protocol.md`, `decisions.md`, `decisions/*`, `audits/*`, all executable code and tests.

## 12. Verification

- [ ] Metrics script green in CI; broken-link gate demonstrated by a seeded broken link (then removed).
- [ ] `index.md` reads under ~2.5k tokens (measured, not estimated).
- [ ] Every converted file validates against `format-standard.md` (script-checked enums).
- [ ] No locked content altered: `git diff --stat` shows zero lines changed under `audits/` and `decisions/`.
- [ ] Post-implementation re-rate targets 9/10 (10th point reserved for proven upkeep over time).
- [ ] Decision record filed in `.okf/decisions/` per protocol §8 (classification: extends existing rule).

## 13. Rollout order

1. `format-standard.md` + metrics script + CI hook (tooling first, proves the gate).
2. `index.md` rewrite + `metrics.md` first generation.
3. `playbooks/` (5 files).
4. Canonical conversions (root → security → hierarchy).
5. Repo-mapping triage frontmatter (batched, metadata-only).
6. Decision record + re-rate.
