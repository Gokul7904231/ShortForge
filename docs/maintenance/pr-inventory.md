# PR Inventory — 2026-11-02

Live snapshot. 19 open PRs (3 drafts), all authored by `Gokul7904231`, **zero
recorded reviews on any PR**. Required-check policy could not be read
(`/branches/main/protection` returned 401 without authentication), so “merge-ready”
is never asserted below.

## Inventory

| PR | Title (short) | Head → Base | Commits / Files | Failing CI checks | Status | Next action |
|---|---|---|---|---|---|---|
| #262 | Update README.md | `Gokul7904231-patch-1` → main | 1 / 1 | Web Regression (informational), OKF lint-sweep, Validate Team change report | BLOCKED by gates; content trivial | Decide whether one-line README change needs a Team report; merge or close |
| #259 | AER shadow evidence | `feat/aer-shadow-evidence-20261031` → main | 26 / 12 | Lightning MP4→CAS→F07, Web Regression (informational) | CI_BLOCKED | Rerun Lightning; if environmental, escalate |
| #258 | Ascalon dataset admission | `feat/ascalon-dataset-admission-20261031` → main | 17 / 8 | Lightning, Web Regression (informational) | CI_BLOCKED | Same |
| #257 | Non-lightning production acceptance | `feat/non-lightning-production-acceptance-20261030` → main | 16 / 98 | Lightning, Web Regression (informational), Single-mission F00–F07 | CI_BLOCKED; canonical acceptance PR | Fix acceptance gate; **supersedes #256** |
| #256 | Creator journey truth fixes | `feat/product-acceptance-20261029` → main | 3 / 29 | Lightning, Web Regression (informational) | DUPLICATE / SUPERSEDED | Owner approves close; all 29 files already in #257 |
| #255 | SDLC Spec Kit governance | `feat/release-sdlc-spec-kit-20261029` → main | 8 / 39 | Lightning, Web Regression (informational) | CI_BLOCKED | Rerun Lightning |
| #254 | Three-agent speedrun docs | `docs/three-agent-production-speedrun-20261029` → main | 39 / 10 | Lightning, Web Regression (informational) | CI_BLOCKED | Rerun Lightning |
| #253 | Node runtime + readiness smoke gate | `fix/production-readiness-smoke-gates-20261029` → main | 3 / 3 | Web Regression (informational), Lightning | CI_BLOCKED | Lowest-risk code PR after #262 |
| #246 | Botkeep release packaging | `feat/botkeep-release` → main | 8 / 16 | Lightning (cancelled), Floor 07 release truth, Web Regression | DRAFT_IN_PROGRESS (16 days) | Owner review; finish or archive |
| #245 | Reverse Features foundation | `feat/reverse-features-foundation-20261017` → main | 3 / 16 | Lightning (cancelled), Floor 07, Web Regression | DRAFT; docs/skills only | Could be readied quickly (no runtime code) |
| #243 | Daytona SDK lifecycle | `fix/daytona-sdk-lifecycle-20261016` → `fix/f07-policy-refresh-20261016` | 6 / 3 | Lightning (cancelled) | DEPENDENCY_BLOCKED: base branch already merged to main | Owner approves retarget to `main` |
| #242 | ShortForge editor | `feat/shortforge-editor-20261012` → main | 205 / 47 | Lightning, Floor 07, Web Regression | DRAFT / oversized | Decompose (see duplicate-work analysis) |
| #241 | AER-Core V3 on OKF V3 | `feat/aer-core-v3-stacked-20261012` → `feat/okf-v3-stacked-on-v2-20261012` | 9 / 45 | none | CI PASS; stacked | Merge after #235 |
| #239 | Visual provider contracts | `feat/visual-provider-contracts-current-main-20261012` → `feat/treasury-wave7-promotion-evidence-20261012` | 1 / 2 | none | CI PASS; stacked | Merge after #237 |
| #238 | Kaggle Wan dual-T4 | `feat/kaggle-wan-dual-t4-current-main-20261012` → same base as #239 | 1 / 14 | none | CI PASS; stacked | Merge after #237 |
| #237 | Treasury promotion evidence | `feat/treasury-wave7-promotion-evidence-20261012` → `feat/okf-v3-stacked-on-v2-20261012` | 20 / 17 | none | CI PASS; stacked | Merge after #235 |
| #235 | OKF V3 control plane | `feat/okf-v3-stacked-on-v2-20261012` → `feat/okf-v2-current-main-20261012` | 6 / 33 | none | CI PASS; stacked | Merge after #234 |
| #234 | OKF V2 control plane | `feat/okf-v2-current-main-20261012` → main | 3 / 21 | Web Regression (informational) only | Stack root; CI otherwise green | Confirm informational job is non-blocking, then merge |
| #230 | OpenComputer/Blaxel adapters | `feat/sandbox-opencomputer-blaxel-20261006` → `fix/f07-policy-refresh-20261016` | 73 / 26 | Lightning (cancelled) | DEPENDENCY_BLOCKED: stale base | Owner approves retarget to `main` |

## Notes

- “Lightning Physical MP4 → CAS → F07” fails or is cancelled on 13 PRs and is the
  dominant systemic blocker. It is an external-provider acceptance job, not a unit test.
- “Web Regression Suite (Informational)” fails on 11 PRs; its name suggests it is
  non-blocking, but the repository’s required-check policy is unverified.
- The `#234 → #235 → #237 → #238 / #239 / #241` stack has no failing checks at all;
  its only blocker is the unmerged stack root.
- No PR has an approving review. GitHub’s mergeability flag alone is not evidence
  of readiness.
