# .okf Agent-Efficiency Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the `.okf/` corpus interface (index, metrics, playbooks, format standard, canonical conversions) so agents navigate 249 files in O(1) hops, lifting all five lens scores to 8-9/10.

**Architecture:** Tooling first (metrics script + CI gate proves the contract), then navigation layer (format-standard, index, playbooks), then content conversion (canonicals, repo-mapping triage), then governance closeout (decision record, re-rate). Playbooks reference rule IDs, never restate rules. Locked content (`audits/`, `decisions/`, protocol) is never rewritten.

**Tech Stack:** Python 3.12 (stdlib + PyYAML, matching existing `tools/okf/` modules), hand-written Markdown, GitHub Actions (extend `okf-governance.yml`).

**Spec:** `docs/superpowers/specs/2026-10-10-okf-agent-efficiency-design.md`

## Global Constraints

- Classification is `extends existing rule` per `decision-protocol.md` §5 — no locked rule rewritten, no silent drift (protocol §9).
- `decision-protocol.md`, `decisions.md`, `decisions/*`, `audits/*` content is never rewritten — zero changed lines under `audits/` and `decisions/`.
- `metrics.md` is never hand-edited — header states generator, regenerate command.
- Playbooks reference rule IDs from `rules/index.json` — never restate rule text.
- `tools/okf/` modules use `from __future__ import annotations`, `ROOT = Path(__file__).resolve().parents[2]`, `main() -> int` returning exit codes, `if __name__ == '__main__': raise SystemExit(main())`.
- Commitlint: only `refactor:` | `feature:` | `bug:` prefixes, lower-case, max 100 chars.
- Commits end with `Co-Authored-By: Claude Code <noreply@anthropic.com>`.
- Frontmatter enums must match `manifest.yaml` exactly (`truth_domains`, `lifecycle_states`); `rules:` entries must exist in `rules/index.json`.
- `index.md` must read under ~2.5k tokens (~10k chars max).
- Python files: run under both local Python 3.13 and CI Python 3.12 with only PyYAML installed.

## Review Focus

- A repo-mapping triage edit accidentally changing body text (not just frontmatter) — expect byte-identical bodies, verified by diff.
- The metrics script passing locally but failing in CI (PyYAML missing, path assumptions) — expect the CI step to install PyYAML first, exactly like the existing sweep step.
- A playbook restating a rule instead of referencing its ID, so a future rule change silently desyncs — expect zero quoted rule text, only `OKF.*` IDs.
- `index.md` creeping past the token budget as rows gain annotations — expect the script to enforce a character cap.
- A canonical conversion dropping a security invariant (e.g. a worker-permission checklist item) — expect row-count parity checks against the original prose lists.

---

## File Structure

New files and what each owns:

- `tools/okf/corpus-metrics.py` — corpus walker: frontmatter parse, internal-link extraction, token estimation, rule-coverage read, `metrics.md` writer, `index.md` count refresher, exit-code gate. Single responsibility: corpus health evidence.
- `.okf/format-standard.md` — the human-readable contract: required frontmatter fields, body rules, worked example. No code.
- `.okf/metrics.md` — generated output only. No human edits, ever.
- `.okf/playbooks/new-decision.md`, `security-change.md`, `rendering-change.md`, `add-repo-mapping.md`, `release.md` — one task checklist each, all following the §7 template.
- `.okf/index.md` (rewrite) — routing table only.
- `docs/superpowers/plans/2026-10-10-okf-agent-efficiency-plan.md` — this file.

Modified files:

- `.github/workflows/okf-governance.yml` — one added step running the metrics gate.
- `.okf/architecture.md`, `.okf/hierarchy-map.md`, `.okf/principles.md`, `.okf/terminology.md`, `.okf/engineering-stack.md` — table-first rewrites preserving all normative content.
- `.okf/security/*.md` (6 files), `.okf/hierarchy/*.md` (10 files) — table-first rewrites preserving all normative content.
- `.okf/research/repo-mappings/*.md` (91 files) — frontmatter prepend only, bodies byte-identical.

---

### Task 1: Metrics script core (walk + frontmatter + links)

**Files:**
- Create: `tools/okf/corpus-metrics.py`
- Test: manual run `python tools/okf/corpus-metrics.py --check-only` (no test framework exists for `tools/okf/`; verification is CLI exit codes + output inspection, matching how `lint.py`/`sweep.py` are validated)

**Interfaces:**
- Consumes: `.okf/**/*.md` files, `.okf/manifest.yaml` (valid enums), `.okf/rules/index.json` (rule IDs)
- Produces: `walk_corpus() -> list[Path]`, `parse_frontmatter(path) -> dict`, `extract_links(path) -> list[str]` — used by Task 2

- [ ] **Step 1: Write the module skeleton with walk + frontmatter + link extraction**

```python
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OKF = ROOT / '.okf'

FRONTMATTER_RE = re.compile(r'\A---\n(.*?)\n---\n?', re.DOTALL)
LINK_RE = re.compile(r'\[[^\]]*\]\(([^)]+)\)')

def walk_corpus() -> list[Path]:
    return sorted(p for p in OKF.rglob('*.md') if p.is_file())

def parse_frontmatter(path: Path) -> dict:
    text = path.read_text(encoding='utf-8')
    m = FRONTMATTER_RE.match(text)
    if not m:
        return {}
    result: dict = {}
    for line in m.group(1).splitlines():
        if ':' not in line:
            continue
        key, _, value = line.partition(':')
        result[key.strip()] = value.strip()
    return result

def extract_links(path: Path) -> list[str]:
    text = path.read_text(encoding='utf-8')
    return [l for l in LINK_RE.findall(text) if not l.startswith(('http://', 'https://', 'mailto:', '#'))]

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--check-only', action='store_true')
    args = parser.parse_args()
    files = walk_corpus()
    print(f'CORPUS_FILES={len(files)}')
    return 0

if __name__ == '__main__':
    raise SystemExit(main())
```

- [ ] **Step 2: Run it to verify the walker works**

Run: `python tools/okf/corpus-metrics.py --check-only`
Expected: `CORPUS_FILES=249` (or current count ± small drift; record actual)

- [ ] **Step 3: Commit**

```bash
git add tools/okf/corpus-metrics.py
git commit -m "feature: add okf corpus walker with frontmatter and link extraction

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

### Task 2: Metrics script gate (validation + exit codes)

**Files:**
- Modify: `tools/okf/corpus-metrics.py` (append validation + gate logic)
- Test: CLI runs — seed a temp broken link, expect exit 1; remove it, expect exit 0

**Interfaces:**
- Consumes: `walk_corpus()`, `parse_frontmatter()`, `extract_links()` from Task 1; `manifest.yaml` enums; `rules/index.json` IDs
- Produces: `validate(files) -> tuple[errors, warnings]`; exit `1` on errors, `0` with warnings printed — consumed by the CI step in Task 3

- [ ] **Step 1: Append the validation logic**

```python
import json

import yaml

MANIFEST = OKF / 'manifest.yaml'
RULE_INDEX = OKF / 'rules' / 'index.json'

def load_enums() -> tuple[set[str], set[str]]:
    manifest = yaml.safe_load(MANIFEST.read_text(encoding='utf-8'))
    return set(manifest.get('truth_domains', [])), set(manifest.get('lifecycle_states', []))

def load_rule_ids() -> set[str]:
    data = json.loads(RULE_INDEX.read_text(encoding='utf-8'))
    return {r['ruleId'] for r in data.get('rules', [])}

def resolve_link(source: Path, link: str) -> Path:
    target = link.split('#')[0].strip()
    if not target:
        return source
    return (source.parent / target).resolve()

def validate(files: list[Path]) -> tuple[list[str], list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    classes, states = load_enums()
    rule_ids = load_rule_ids()
    for path in files:
        fm = parse_frontmatter(path)
        if not fm:
            warnings.append(f'{path.relative_to(ROOT)}: missing frontmatter (on-touch scope)')
            continue
        if fm.get('class') not in classes:
            errors.append(f'{path.relative_to(ROOT)}: invalid class {fm.get("class")!r}')
        if fm.get('status') not in states:
            errors.append(f'{path.relative_to(ROOT)}: invalid status {fm.get("status")!r}')
        for rid in [r.strip() for r in fm.get('rules', '[]').strip('[]').split(',') if r.strip()]:
            if rid and rid not in rule_ids:
                errors.append(f'{path.relative_to(ROOT)}: unknown rule {rid}')
        for link in extract_links(path):
            resolved = resolve_link(path, link)
            if not resolved.exists() or not str(resolved).startswith(str(ROOT)):
                errors.append(f'{path.relative_to(ROOT)}: broken link {link}')
    return errors, warnings
```

Wire into `main()`: replace the `--check-only` body with full validation — on errors print each as `ERROR: ...` to stderr and return 1; on warnings-only print each as `WARN: ...` and return 0 with `OKF_METRICS=PASS`.

- [ ] **Step 2: Verify failure mode with a seeded broken link**

Run: create `C:\Users\ASUS\AppData\Local\Temp\okf-broken-test.md`? No — seed inside repo then revert: append `[broken](../nonexistent.md)` to a scratch copy? Simplest: temporarily append a broken link line to `.okf/exceptions/README.md`, run script, expect exit 1 with `ERROR: ... broken link`, then `git checkout -- .okf/exceptions/README.md`, run again, expect exit 0.

Run: `python tools/okf/corpus-metrics.py`
Expected: exit 0, `OKF_METRICS=PASS` (warnings allowed for the 240+ files without frontmatter yet)

- [ ] **Step 3: Commit**

```bash
git add tools/okf/corpus-metrics.py
git commit -m "feature: add okf metrics validation gate with exit codes

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

### Task 3: Metrics report writer + CI hook

**Files:**
- Modify: `tools/okf/corpus-metrics.py` (append `write_metrics()` + `refresh_index_counts()`)
- Create: `.okf/metrics.md` (generated output)
- Modify: `.github/workflows/okf-governance.yml` (add metrics step)

**Interfaces:**
- Consumes: `validate()` from Task 2; current `.okf/index.md` table (to refresh `Files (N)`)
- Produces: `.okf/metrics.md` with the six §6 sections; updated counts in `index.md`; CI step that fails the build on errors

- [ ] **Step 1: Append the report writer**

```python
from datetime import datetime, timezone

METRICS = OKF / 'metrics.md'
INDEX = OKF / 'index.md'

def estimate_tokens(path: Path) -> int:
    return len(path.read_text(encoding='utf-8')) // 4

def write_metrics(files: list[Path], errors: list[str], warnings: list[str]) -> None:
    data = json.loads(RULE_INDEX.read_text(encoding='utf-8'))
    by_status: dict[str, int] = {}
    for r in data.get('rules', []):
        by_status[r.get('status', '?')] = by_status.get(r.get('status', '?'), 0) + 1
    per_domain: dict[str, int] = {}
    for p in files:
        d = p.parent.relative_to(OKF).as_posix()
        per_domain[d] = per_domain.get(d, 0) + 1
    biggest = sorted(files, key=estimate_tokens, reverse=True)[:5]
    with_frontmatter = sum(1 for p in files if parse_frontmatter(p))
    lines = [
        'GENERATED — do not hand-edit. Source: tools/okf/corpus-metrics.py.',
        'Regenerate: `python tools/okf/corpus-metrics.py`.',
        f'Generated: {datetime.now(timezone.utc).isoformat()}',
        '',
        '## Corpus size',
        '',
        f'- Total markdown files: {len(files)}',
        *['- `...`' for _ in []],
        '',
        '## Freshness',
        '',
        '- (`updated` tracking begins once converted files carry frontmatter)',
        '',
        '## Structure coverage',
        '',
        f'- Files with frontmatter: {with_frontmatter}/{len(files)}',
        '',
        '## Link health',
        '',
        f'- Broken links (CI-failing): {len([e for e in errors if "broken link" in e])}',
        f'- Files with zero inbound links: (computed in a later wave)',
        '',
        '## Rule coverage',
        '',
        *[f'- {k}: {v}' for k, v in sorted(by_status.items())],
        '',
        '## Triage',
        '',
        f'- Errors: {len(errors)}; warnings: {len(warnings)}',
        '',
    ]
    counts = '\n'.join(f'- `{d}/`: {n}' for d, n in sorted(per_domain.items()))
    lines.insert(7, counts)
    METRICS.write_text('# .okf Corpus Metrics\n\n' + '\n'.join(lines), encoding='utf-8')
    print(f'METRICS_WRITTEN={METRICS.relative_to(ROOT)}')
```

Keep it simple: per-domain counts inline, no orphan analysis yet (that is the documented later wave — the line says so, no placeholder).

- [ ] **Step 2: Generate metrics.md and verify output**

Run: `python tools/okf/corpus-metrics.py`
Expected: exit 0, `.okf/metrics.md` created with all six sections, counts matching `walk_corpus()` length

- [ ] **Step 3: Add the CI step to okf-governance.yml**

Edit `.github/workflows/okf-governance.yml` — insert after the `Compile OKF sweep` step:

```yaml
      - name: Check OKF corpus metrics
        run: python -m tools.okf.corpus-metrics
```

Note: `tools/okf/` has no `__init__.py` — verify `python -m tools.okf.lint` works from repo root first (it is invoked that way in CI already, so the namespace-package resolution holds; the new module follows the same pattern with no new imports beyond stdlib + yaml).

- [ ] **Step 4: Commit**

```bash
git add tools/okf/corpus-metrics.py .okf/metrics.md .github/workflows/okf-governance.yml
git commit -m "feature: add okf metrics report and governance CI gate

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

### Task 4: format-standard.md

**Files:**
- Create: `.okf/format-standard.md`

**Interfaces:**
- Consumes: spec §8 (frontmatter schema, body rules); `manifest.yaml` enum values (copy verbatim)
- Produces: the contract Tasks 6-8 validate against

- [ ] **Step 1: Write format-standard.md**

Content: frontmatter field table (field, required?, allowed values, source), body rules (tables before prose, ASCII-diagram companion tables, truth tags per claim, no new Document Class values), one full worked example converting a prose section to table-first, and the on-touch rule for out-of-scope files. Keep under ~150 lines.

- [ ] **Step 2: Self-check against the spec**

Run: `git diff --stat` to confirm no other files touched; re-read spec §8 and check every requirement appears in the file.

- [ ] **Step 3: Commit**

```bash
git add .okf/format-standard.md
git commit -m "feature: add okf format standard for table-first files

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

### Task 5: index.md router rewrite

**Files:**
- Modify: `.okf/index.md` (full rewrite, ~22 rows)

**Interfaces:**
- Consumes: `decision-protocol.md` §2 step numbers; per-domain file counts from Task 3 output
- Produces: the thin router every later task links from

- [ ] **Step 1: Write the new index.md**

One-line header with read path, then the routing table with exact columns `Domain | Entry file | Files (N) | Read when | Sweep step`. 22 rows: one per `.okf/` subdirectory (20) + root canonicals + governance control plane. `Files (N)` copied from generated `metrics.md`. No prose sections.

- [ ] **Step 2: Verify token budget and links**

Run: `python tools/okf/corpus-metrics.py` — expect exit 0 (new index links must all resolve). Check: file under ~10k chars (`(Get-Content .okf/index.md -Raw).Length` in PowerShell or `wc -c`).

- [ ] **Step 3: Commit**

```bash
git add .okf/index.md
git commit -m "feature: rewrite okf index as agent routing table

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

### Task 6: Playbooks (5 files)

**Files:**
- Create: `.okf/playbooks/new-decision.md`, `security-change.md`, `rendering-change.md`, `add-repo-mapping.md`, `release.md`

**Interfaces:**
- Consumes: spec §7 template + per-playbook rule IDs and sweep subsets; `rules/index.json` (IDs only)
- Produces: task checklists agents follow when acting

- [ ] **Step 1: Write all five playbooks**

Each follows the template: `# Playbook: <task>`, then sections Purpose, Rule IDs (IDs only, zero quoted rule text), Minimal sweep subset (protocol §2 step numbers), Checklist (checkbox items), Evidence outputs, Done criteria. Sweep subsets copied verbatim from spec §7 table.

- [ ] **Step 2: Verify no rule text restatement and all links resolve**

Run: `python tools/okf/corpus-metrics.py` — expect exit 0. Manual check: `grep -r "may not become sovereign" .okf/playbooks/` returns nothing (rule text lives in `rules/index.json` + source files, not playbooks).

- [ ] **Step 3: Commit**

```bash
git add .okf/playbooks/
git commit -m "feature: add okf task playbooks for agent onboarding

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

### Task 7: Root canonical conversions (5 files)

**Files:**
- Modify: `.okf/architecture.md`, `.okf/hierarchy-map.md`, `.okf/principles.md`, `.okf/terminology.md`, `.okf/engineering-stack.md`

**Interfaces:**
- Consumes: `format-standard.md` (Task 4); original prose (normative content preserved 1:1)
- Produces: table-first canonicals with valid frontmatter

- [ ] **Step 1: Convert principles.md (smallest — proves the pattern)**

Prepend valid frontmatter (`domain: root`, `class: normative_policy`, `status: ACTIVE`, `sweep_step: 2`, `owner: Human/Overseer`, `rules: []`, `updated: <today>`). Restructure the 10 principles as a table (`# | Principle | Invariant | Enforcement`) keeping every invariant sentence; prose annotations become table-cell text, not deleted.

- [ ] **Step 2: Convert the remaining four root files**

Same pattern per file. `hierarchy-map.md`: ASCII diagram gets a companion level table (level, entity, authority, boundary) — diagram may stay, table is additive. `terminology.md`: already definition-like — normalize to `Term | Definition | Used in` table. `architecture.md`, `engineering-stack.md`: section tables first, explanatory prose condensed to annotated rows.

- [ ] **Step 3: Validate and commit**

Run: `python tools/okf/corpus-metrics.py` — expect exit 0 (valid enums, resolvable links).
Run: `git diff --stat` — expect only the 5 files.
Row-count parity: each file's checklist/numbered-list item count before vs after must match (spot-check worker-permissions-style lists).

```bash
git add .okf/architecture.md .okf/hierarchy-map.md .okf/principles.md .okf/terminology.md .okf/engineering-stack.md
git commit -m "refactor: convert okf root canonicals to table-first format

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

### Task 8: security/ + hierarchy/ conversions (16 files)

**Files:**
- Modify: `.okf/security/*.md` (6 files), `.okf/hierarchy/*.md` (10 files)

**Interfaces:**
- Consumes: `format-standard.md`; originals (security invariants preserved exactly)
- Produces: table-first security + hierarchy canonicals

- [ ] **Step 1: Convert security/ (6 files)**

`worker-permissions.md` first: the 10-item absolute-rule checklist becomes a table (`# | Condition | Checked at`) — all 10 rows, zero dropped. Remaining five files same pattern. Frontmatter: `domain: security`, `sweep_step: 4`, `rules:` with the matching `OKF.*` ID where one exists (e.g. `OKF.SECURITY.LEAST_PRIVILEGE` for worker-permissions), `[]` otherwise.

- [ ] **Step 2: Convert hierarchy/ (10 files)**

One file per entity: frontmatter (`domain: hierarchy`, `sweep_step: 3`), role table (`Aspect | Rule`: authority, boundaries, escalation, never-does). Guardian/Slayer/Healer enforcement chains become tables, not ASCII.

- [ ] **Step 3: Validate and commit**

Run: `python tools/okf/corpus-metrics.py` — expect exit 0.
Invariant parity: `worker-permissions.md` table has exactly 10 condition rows.

```bash
git add .okf/security/ .okf/hierarchy/
git commit -m "refactor: convert okf security and hierarchy to table-first format

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

### Task 9: Repo-mapping triage frontmatter (91 files, batched)

**Files:**
- Modify: `.okf/research/repo-mappings/*.md` (frontmatter prepend only)

**Interfaces:**
- Consumes: existing bodies (byte-identical — prepend only, no edits)
- Produces: triage metadata (`assimilation: adopted | rejected | reference`) enabling the metrics triage section

- [ ] **Step 1: Prepend triage frontmatter in batches of ~30**

Script it (one-off, not committed):

```powershell
$files = Get-ChildItem .okf/research/repo-mappings/*.md
foreach ($f in $files) {
  $raw = Get-Content $f.FullName -Raw
  if ($raw.StartsWith('---')) { continue }
  $fm = "---`ndomain: research`nclass: historical_record`nstatus: ACTIVE`nsweep_step: 6`nowner: Human/Overseer`nrules: []`nupdated: 2026-10-10`nassimilation: reference`n---`n`n"
  Set-Content $f.FullName ($fm + $raw) -Encoding utf8 -NoNewline
}
```

Default every mapping to `reference`; then hand-correct the known-adopted ones (Remotion → adopted, AgentTube → adopted, per `engineering-stack.md` and existing index rows) to `adopted`. Rejected stays for mappings the corpus explicitly declined — only mark where the mapping file itself says so.

- [ ] **Step 2: Verify bodies byte-identical and commit in 3 batch commits**

Run: `git diff --stat` — expect 91 files, additions only at file heads. Spot-check: `git diff .okf/research/repo-mappings/<one-file> | head -20` shows only `+---` frontmatter lines, no `-` body lines.
Run: `python tools/okf/corpus-metrics.py` — expect exit 0.

```bash
git add .okf/research/repo-mappings/
git commit -m "refactor: add triage frontmatter to okf repo mappings

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

### Task 10: Decision record + re-rate + final verification

**Files:**
- Create: `.okf/decisions/okf-agent-efficiency-restructure-20261010.md`
- Modify: none (verification only)

**Interfaces:**
- Consumes: everything above; `decision-protocol.md` §8 (14 required record fields)
- Produces: the filed decision + five-lens re-rating targeting 8-9/10

- [ ] **Step 1: Write the decision record**

All 14 protocol §8 fields: Decision, Classification (`extends existing rule`), Existing rules considered, Repo mappings (none — no mapped domain touched), Hierarchy nodes, Workers/permissions (none changed), Contracts, Security impact (none — interface only), Performance impact (agent token cost down), Verification plan (this plan's Task 3 + 10 gates), Implementation status, Rollback (revert commits; generated files regenerable), Provenance, Date.

- [ ] **Step 2: Run the full verification suite**

Run: `python tools/okf/corpus-metrics.py` — expect exit 0, `OKF_METRICS=PASS`.
Run: `python -m tools.okf.lint` — expect `OKF_LINT=PASS`.
Run: `git diff --stat main -- audits/ decisions/` — expect zero lines under `audits/`; `decisions/` shows only the new record file.
Run: index size check — under ~10k chars.
Run: seeded-broken-link gate demo — append broken link, expect exit 1; revert, expect exit 0.

- [ ] **Step 3: Commit and report the re-rating**

```bash
git add .okf/decisions/okf-agent-efficiency-restructure-20261010.md
git commit -m "feature: file okf agent-efficiency restructure decision record

Co-Authored-By: Claude Code <noreply@anthropic.com>"
```

Expected re-rating: Designer 8, Engineer 8, Architect 9, Senior Eng 8, Agent Lead 9 (10th point reserved for proven upkeep over time, per spec §12).
