---
id: TASK-10
title: Physical Worker Fleet Heartbeat Diagnostic & Re-sync
status: Done
assignee: []
created_date: '2026-11-20T08:48:00Z'
updated_date: '2026-11-20T15:06:00Z'
labels:
  - fleet
milestone: m-4
dependencies: []
priority: high
type: bug
ordinal: 10000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Diagnose and restore live heartbeat loop across all 11 worker nodes
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Worker heartbeat loop active
- [x] #2 All 11 nodes transition from BLOCKED to HEALTHY in fleet health
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. SSH into box2-box13. 2. Verify worker.env. 3. Restart instabox-worker.service.
<!-- SECTION:PLAN:END -->
