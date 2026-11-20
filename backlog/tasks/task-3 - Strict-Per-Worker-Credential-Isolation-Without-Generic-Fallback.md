---
id: TASK-3
title: Strict Per-Worker Credential Isolation Without Generic Fallback
status: Done
assignee: []
created_date: '2026-11-20T08:47:00Z'
labels: []
milestone: m-1
dependencies: []
priority: high
type: bug
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Remove generic worker secret fallback; enforce exact per-worker secret INSTABOX_WORKER_SECRET_<NODE>
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Generic worker secret rejected for individual nodes
- [ ] #2 All 11 secrets required for fleet readiness
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented in commit dd760512 and 99a9aa6b
<!-- SECTION:FINAL_SUMMARY:END -->
