
# ShortForge / FactoryOS — Production Helper Operating Contract

> Document Class: Operational Validation & Evidence Contract
> Status: CANONICAL ROUTINE
> Scope: production-helper/
> Purpose: Make the existing production-helper workspace a routine part of engineering, security, staging, and release verification.

## 1. What production-helper is

production-helper is an engineering verification workspace.

It currently contains:

- P0 hardening reports
- real Azure end-to-end proof
- real runtime convergence traces
- security forensic reports
- Semgrep rule definitions and reports
- Strix security-audit instructions

It is not a second source of truth.

It is an evidence-producing operational layer.

## 2. Routine usage rule

The appropriate production-helper checks must be considered whenever work affects:

- worker permissions
- Guardian / capability policy
- render routing
- remote worker callbacks
- quotas
- authentication / authorization
- network egress
- filesystem boundaries
- provider adapters
- production completion states
- major architecture decisions

## 3. Routine engineering cycle

### Before implementation

1. Complete the mandatory .okf review.
2. Inspect relevant existing production-helper evidence.
3. Identify the exact invariant being changed.
4. Identify the tests that must fail if the invariant is broken.

### During implementation

Run the smallest applicable checks continuously.

### Before merge

Run:

- targeted unit tests
- relevant integration tests
- architectural invariant tests
- Semgrep security scan when security-sensitive
- production-helper staging checks when runtime behavior changed

### Before production

For production-impacting changes, prefer:

~~~
build / typecheck
  |
targeted tests
  |
security scan
  |
staging runtime trace
  |
real external integration proof where required
  |
forensic evidence review
  |
release
~~~

## 4. Semgrep routine

Current helper configuration:

production-helper/semgrep/rules/shortforge-rules.yaml

Last recorded security audit scanned 522 files and produced 75 rule results:

- 65 dangerous-fetch / SSRF warnings
- 6 path-traversal warnings
- 4 command-execution warnings

These are not automatically confirmed vulnerabilities. They are static-analysis findings requiring triage.

Routine rule:

No Semgrep warning is silently ignored. Each production-relevant finding is:

- fixed
- explicitly justified
- or tracked as a known accepted risk with evidence.

## 5. Strix routine

Strix is the dynamic penetration-testing path.

The last recorded security audit classified Strix as UNPROVEN because Docker was unavailable.

Therefore:

- Strix is part of the routine security toolkit.
- A blocked Strix run is not a green security result.
- Docker must be available before claiming dynamic Strix coverage.
- The absence of a Strix run must be recorded honestly.

## 6. Real runtime proof

The helper workspace already contains real staging evidence for:

- remote Azure dispatch
- zero local-rendering assertions
- Guardian safety gating
- Python floor bridge signatures/nonces
- Slayer / Healer reliability
- callback convergence
- multi-tenant boundaries

Future changes to these surfaces should reuse the same proof style.

## 7. P0 hardening lessons

The existing P0 report established concrete engineering rules:

- every quota reservation must have a safe release path
- failed Azure dispatch must become an explicit failed state
- polling must terminate at bounded terminal states
- stale reservations require bounded cleanup
- failures must not silently leave hanging jobs

These lessons should be reused whenever a new asynchronous workflow is introduced.

## 8. Production-helper evidence classification

Every helper result must be tagged as one of:

- TEST_VERIFIED
- LIVE_VERIFIED
- SECURITY_SCAN
- STATIC_WARNING
- BLOCKED
- UNPROVEN
- OBSERVED_MEASUREMENT

Do not collapse BLOCKED or UNPROVEN into PASS.

## 9. Relationship to .okf

Helper evidence flows into:

~~~
production-helper
   |
raw evidence
   |
audit / finding
   |
.okf/audits/
   |
decision / remediation
   |
code + tests
~~~

The helper does not rewrite architecture documentation by itself.

## 10. Relationship to workers

Production-helper can test worker behavior.

It cannot:

- grant worker permissions
- modify Guardian authority
- bypass worker fencing
- authorize production side effects
- fabricate successful worker output

## 11. Release gate

A production-impacting change is not considered verified until:

- relevant code is tested
- relevant security checks are run
- helper evidence is reviewed
- blocked checks are disclosed
- physical output is verified when media is involved

## 12. Routine ownership

Overseer:
- coordinates production evidence requirements.

SCL:
- helps select the smallest sufficient test / diagnostic path.

Guardian:
- ensures permissions remain within policy.

Slayer:
- responds to failed or dangerous runtime behavior.

Healer:
- repairs bounded failures.

F07 / Auditor:
- independently verifies output.

Production-helper:
- provides repeatable engineering evidence.

## 13. Absolute rule

production-helper exists to make verification routine, not to make verification ceremonial.

A green-looking report without real evidence is not a green system.
