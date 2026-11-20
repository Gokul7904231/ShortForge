---
id: TASK-5
title: Fail-Closed Artifact Verification in Dispatch Route
status: Done
assignee: []
created_date: '2026-11-20T08:47:00Z'
labels: []
milestone: m-3
dependencies: []
priority: high
type: feature
ordinal: 5000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Enforce streaming SHA-256 verification and F06/F07 quality gates in dispatch POST
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Mismatched SHA-256 rejected with 422
- [ ] #2 F06 verifier status != PASS rejected with 422
- [ ] #3 F07 media audit failures rejected with 422
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented in commit 648c15f3
<!-- SECTION:FINAL_SUMMARY:END -->
