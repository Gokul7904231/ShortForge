# Branch Hygiene — Live Repository State (2026-09-27)

## Current live branch inventory

The repository currently exposes **5 branches**:

- main — canonical production branch.
- feat/ascalon-clm-aria2-upgrade-20260927 — PR #39 is open; the branch is 24 commits ahead and 1 behind main. It contains a new CLM/Aria2 implementation and must remain reviewable until PR disposition is explicit.
- feat/floor05-pretraining-hardening-wave3-20260927 — PR #35 is closed and unmerged; it is 35 commits ahead and 80 behind main. Retain as an archive/review candidate; do not silently merge.
- feat/floor07-pretraining-hardening-20260927 — PR #38 was merged; the branch remains because repository auto-delete-on-merge is disabled. Its 21-commit divergence is retained only as historical provenance.
- research/movie-intelligence-wave1 — research-only branch with 9 commits not in main; retain as a research archive.

## Safety rule

A branch is deleted only when:
1. its production changes are already represented in main, or
2. it is explicitly approved for archival deletion after confirming no unique research or implementation evidence is needed.

Unique open or unmerged implementation branches are not deleted merely because main has moved on.

## Current cleanup state

This document reflects the live repository audit performed on 2026-09-27. Earlier branch-count records are historical and must not be used as current repository truth.

Repository setting delete_branch_on_merge remains disabled, so merged source branches may remain as refs until explicitly removed.

## Ascalon training implication

Branch existence is not evidence of production architecture. Ascalon trajectory generation must use the canonical main commit and explicit Team/CI evidence. Unmerged branch content is classified as proposal/research until promoted through the normal gate.
