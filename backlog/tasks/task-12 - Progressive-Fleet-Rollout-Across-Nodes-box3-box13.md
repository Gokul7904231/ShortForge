---
id: TASK-12
title: Progressive Fleet Rollout Across Nodes box3-box13
status: To Do
assignee: []
created_date: '2026-11-20T08:48:00Z'
labels:
  - phase/plan
  - fleet
milestone: m-4
dependencies:
  - TASK-11
priority: high
type: task
ordinal: 12000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Drain, update agent.py, restart service, and undrain across all 10 remaining fleet nodes
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Sequential rollout with zero downtime
- [ ] #2 All 10 workers reporting HEALTHY
<!-- AC:END -->
