---
id: TASK-9
title: Box1 Control Plane Service Restart & Admin Secret Activation
status: Done
assignee: []
created_date: '2026-11-20T08:48:00Z'
updated_date: '2026-11-20T13:24:52Z'
labels:
  - operations
milestone: m-4
dependencies: []
priority: high
type: task
ordinal: 9000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Restart shortforge-controlplane.service on box1 to load hardened dispatch route and admin secret
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Next.js dev server reloaded with admin secret
- [x] #2 GET and POST dispatch endpoints return 401 without admin secret
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Verify .env.local on box1. 2. Restart service. 3. Validate liveness.
<!-- SECTION:PLAN:END -->
