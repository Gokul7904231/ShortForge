# Branch Hygiene — Live Repository State (2026-09-27)

## Current live branch inventory

At the time of this reconciliation, GitHub exposes **6 branches**:

- main — canonical production branch.
- feat/ascalon-clm-aria2-upgrade-20260927 — PR #39 open; 24 commits ahead and 1 behind main. Contains CLM/Aria2 proposal work.
- feat/ascalon-cross-floor-reconciliation-20260927 — PR #40 open; current reconciliation branch; all dedicated floor gates and Team/CI evidence are being used for admission.
- feat/floor05-pretraining-hardening-wave3-20260927 — PR #35 closed and unmerged; 35 commits ahead and 80 behind main. Retained as a review/archive candidate.
- feat/floor07-pretraining-hardening-20260927 — PR #38 merged; source ref remains because delete-on-merge is disabled.
- research/movie-intelligence-wave1 — research-only branch with 9 commits not in main.

## Safety rule

A branch is deleted only when:
1. its production changes are already represented in main, or
2. it is explicitly approved for archival deletion after confirming no unique research or implementation evidence is needed.

Unique open or unmerged implementation branches are not deleted merely because main has moved on.

## Merge-cleanup behavior

The repository setting delete_branch_on_merge is disabled. Merging a PR therefore does not remove its source branch reference automatically.

After PR #40 merges, the reconciliation source branch is expected to remain as a historical ref unless a repository owner deletes it through GitHub's branch-management UI/API. The connected GitHub MCP surface used for this work does not expose branch/ref deletion, so no false deletion claim is made.

## Ascalon provenance rule

Branch existence is not evidence of production architecture. Ascalon trajectory generation must use the canonical main commit and explicit Team/CI evidence. Unmerged branch content is proposal/research until promoted through the normal gate.
