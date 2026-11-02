# PR Merge Readiness — 2026-11-02

Statuses: `PASS`, `FAIL`, `BLOCKED`, `NOT_TESTED`, `NOT_APPLICABLE`.
“Merge-ready” is not claimed for any PR: the repository’s required-check policy
(`main` branch protection) could not be read (HTTP 401), and **no PR has a review**.

## Gate summary

| Gate | Result |
|---|---|
| Conflicting files | None reported for any PR (`mergeable_state` was `clean` or `unstable`, never `dirty`) |
| Required checks | NOT_TESTED — protection/rulesets inaccessible without auth |
| Reviews | FAIL — 0 reviews on all 19 PRs |
| Base correctness | FAIL — #230 and #243 target a stale, already-merged base |
| Dependency order | BLOCKED — #234 stack must merge bottom-up |
| Supersession | #256 superseded by #257 |

## Per-PR scorecard

| PR | Code | CI | Review | Architecture | Integration | Verdict |
|---|---|---|---|---|---|---|
| #262 | PASS (1-line docs) | FAIL (OKF lint, Team report, informational web) | FAIL (none) | N/A | PASS | BLOCKED_BY_GATE |
| #253 | PASS (3 files) | FAIL (Lightning, informational web) | FAIL | NOT_TESTED | PASS | CI_BLOCKED |
| #259 | NOT_TESTED | FAIL (Lightning, informational web) | FAIL | NOT_TESTED | PASS | CI_BLOCKED |
| #258 | NOT_TESTED | FAIL (Lightning, informational web) | FAIL | NOT_TESTED | PASS | CI_BLOCKED |
| #257 | NOT_TESTED | FAIL (Lightning, Single-mission, informational web) | FAIL | PRESERVES F05/F06/F07 per title/files | PASS | CI_BLOCKED |
| #256 | PASS (contained in #257) | FAIL (Lightning, informational web) | FAIL | duplicate | DUPLICATE | SUPERSEDED |
| #255 | NOT_TESTED | FAIL (Lightning, informational web) | FAIL | docs/governance only | PASS | CI_BLOCKED |
| #254 | NOT_TESTED | FAIL (Lightning, informational web) | FAIL | docs only | PASS | CI_BLOCKED |
| #246 | NOT_TESTED | FAIL (Floor 07, Lightning cancelled) | FAIL | release tooling | PASS | DRAFT_BLOCKED |
| #245 | PASS (docs/skills only) | FAIL (Floor 07, Lightning cancelled) | FAIL | no runtime change | PASS | DRAFT_BLOCKED |
| #243 | NOT_TESTED | FAIL (Lightning cancelled) | FAIL | sandbox adapter | **BLOCKED** (base not main) | RETARGET_REQUIRED |
| #242 | NOT_TESTED | FAIL (Floor 07, Lightning, informational web) | FAIL | large, mixed scope | **BLOCKED** (oversized) | DECOMPOSE |
| #241 | NOT_TESTED | **PASS** (0 failing) | FAIL | stacked on #235 | BLOCKED (dependency) | DEPENDENCY_BLOCKED |
| #239 | NOT_TESTED | **PASS** | FAIL | stacked on #237 | BLOCKED (dependency) | DEPENDENCY_BLOCKED |
| #238 | NOT_TESTED | **PASS** | FAIL | stacked on #237 | BLOCKED (dependency) | DEPENDENCY_BLOCKED |
| #237 | NOT_TESTED | **PASS** | FAIL | stacked on #235 | BLOCKED (dependency) | DEPENDENCY_BLOCKED |
| #235 | NOT_TESTED | **PASS** | FAIL | stacked on #234 | BLOCKED (dependency) | DEPENDENCY_BLOCKED |
| #234 | NOT_TESTED | FAIL (informational web only) | FAIL | stack root, base main | root of chain | LIKELY_READY pending policy |
| #230 | NOT_TESTED | FAIL (Lightning cancelled) | FAIL | sandbox adapters | **BLOCKED** (base not main) | RETARGET_REQUIRED |

## Readiness notes

1. **#234** is the only PR whose only failure is explicitly labelled
   “(Informational)”. If the owner confirms that job is non-blocking, #234 is the
   first merge candidate and unblocks five stacked PRs.
2. **#262** is content-trivial but fails the Team-report validator; decide whether
   that gate applies to a one-line README edit.
3. **#253** is the lowest-risk code change but is blocked by the same Lightning
   acceptance job that fails across the repository.
4. **#257 vs #256**: #257 contains every #256 file and is 13 commits ahead; keep #257.
5. **#243/#230**: both bases are already merged to `main`; retarget before any
   readiness assessment is meaningful.
6. Every PR still needs at least one review; CI green alone is insufficient.
