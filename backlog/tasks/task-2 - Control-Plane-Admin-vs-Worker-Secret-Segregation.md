---
id: TASK-2
title: Control Plane Admin vs Worker Secret Segregation
status: Done
assignee: []
created_date: '2026-11-20T08:47:00Z'
labels: []
milestone: m-1
dependencies: []
priority: high
type: feature
ordinal: 2000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Segregate admin routes from worker tokens; introduce authenticateControlPlaneAdmin
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Admin dispatch requires admin secret
- [ ] #2 Worker secret rejected from admin routes
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented in commit 648c15f3
<!-- SECTION:FINAL_SUMMARY:END -->
