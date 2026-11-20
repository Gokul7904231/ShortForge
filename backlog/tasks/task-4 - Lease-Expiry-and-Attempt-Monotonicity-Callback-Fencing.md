---
id: TASK-4
title: Lease Expiry and Attempt Monotonicity Callback Fencing
status: Done
assignee: []
created_date: '2026-11-20T08:47:00Z'
labels: []
milestone: m-2
dependencies: []
priority: high
type: bug
ordinal: 4000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Strict callback attemptId equality, lease expiry checks, workerId and executionId fencing
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Missing or non-integer attemptId rejected (400)
- [ ] #2 Stale (<) or superseded (>) attempts rejected (409)
- [ ] #3 Expired leases rejected (409)
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented in commit dd760512
<!-- SECTION:FINAL_SUMMARY:END -->
