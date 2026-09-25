# ShortForge / FactoryOS — Production Helper Operating Contract

> Document Class: Operational Validation & Evidence Contract
> Status: CANONICAL ROUTINE / MANDATORY WHERE APPLICABLE
> Scope: production-helper/
> Purpose: Make the existing production-helper workspace a routine evidence-producing engineering station for implementation, security, staging, release, and architecture decisions.

## 1. Role

production-helper is not a second source of truth and is not a green-light generator.

It is a repeatable evidence station.

Its reports can prove, disprove, or expose gaps in:
- worker behavior
- security boundaries
- render dispatch
- remote callbacks
- quotas
- runtime convergence
- staging behavior
- release invariants

Architecture authority remains the .okf + executable implementation + tests hierarchy.

## 2. Actual helper inventory

Current repository structure:

~~~
production-helper/
├── README.md
├── combined/
│   └── reports/
│       ├── factoryos-p0-basic-hardening.md
│       ├── factoryos-real-azure-e2e.md
│       ├── factoryos-real-runtime-trace.md
│       └── shortforge-security-audit-final.md
├── semgrep/
│   ├── rules/
│   │   └── shortforge-rules.yaml
│   └── reports/
│       └── semgrep-report.json
└── strix/
    └── prompts/
        └── shortforge-audit-instructions.md
~~~

This inventory is versioned evidence; new helper assets must be reflected here when they become routine.

## 3. Mandatory decision usage

For non-trivial engineering decisions:

~~~
Complete .okf sweep
      |
Relevant repo mappings
      |
Relevant production-helper evidence
      |
Implementation
      |
Tests
      |
Applicable helper checks
      |
Evidence review
      |
Decision / promotion
~~~

The helper is mandatory for changes affecting:
- worker permissions
- Guardian / capability policy
- rendering / TimelineIR compiler
- remote compute
- callbacks
- quotas
- auth / RBAC
- filesystem or network boundaries
- provider adapters
- production completion semantics
- significant architecture changes

## 4. Routine engineering cycle

### Before implementation

1. Complete the full current .okf decision sweep.
2. Inspect applicable repo mappings.
3. Inspect relevant helper reports.
4. Identify the exact invariant being changed.
5. Identify the executable implementation and tests.
6. Define required evidence.

### During implementation

Run the smallest useful checks continuously.

### Before merge

Use:
- targeted unit tests
- architecture invariant tests
- relevant integration tests
- Semgrep for security-sensitive changes
- helper runtime/staging checks when distributed behavior changes

### Before production

Preferred gate:

~~~
typecheck / build
  |
targeted tests
  |
architecture / security tests
  |
Semgrep where applicable
  |
Strix when Docker is available
  |
staging / real-runtime proof where applicable
  |
physical artifact verification where applicable
  |
evidence review
  |
release
~~~

## 5. Semgrep routine

Canonical rule file:
production-helper/semgrep/rules/shortforge-rules.yaml

Recorded historical run:
- 522 files scanned
- 75 static findings
- 65 dangerous-fetch / SSRF warnings
- 6 path-traversal warnings
- 4 command-execution warnings

These are historical findings and are not current status.

Rule:
No Semgrep warning becomes invisible. Each production-relevant result is:
- fixed
- explicitly justified
- or tracked as an accepted risk with evidence.

## 6. Strix routine

Strix is the dynamic security testing path.

Current recorded status:
UNPROVEN when Docker was unavailable.

Rules:
- a blocked Strix run is not a PASS
- Docker must be available before claiming dynamic Strix coverage
- missing dynamic coverage remains disclosed
- successful Strix results must be preserved as evidence

## 7. Real-runtime proof

The helper workspace contains evidence for:
- remote Azure dispatch
- callback convergence
- Guardian safety gating
- Python floor bridge signatures/nonces
- Slayer / Healer reliability
- multi-tenant boundaries
- quota hardening

Future changes to these surfaces should reuse the same evidence style.

## 8. P0 lessons are reusable invariants

The helper history established reusable rules:
- every quota reservation needs a safe release path
- failed remote dispatch must become an explicit failed state
- polling must reach bounded terminal states
- stale reservations require bounded cleanup
- asynchronous failures must not leave hanging jobs
- HTTP dispatch success is not physical completion
- completion requires authoritative callback/state plus physical artifact evidence

These are reusable engineering constraints, not merely historical bugs.

## 9. Evidence classes

Every helper result must be explicitly classified:
- TEST_VERIFIED
- LIVE_VERIFIED
- SECURITY_SCAN
- STATIC_WARNING
- BLOCKED
- UNPROVEN
- OBSERVED_MEASUREMENT

Do not collapse BLOCKED or UNPROVEN into PASS.

## 10. Relationship to .okf

~~~
production-helper
   |
raw evidence
   |
finding / interpretation
   |
.okf/audits or decision record
   |
code + tests
~~~

The helper does not rewrite architecture documentation automatically.

## 11. Relationship to worker permissions

Production-helper can test worker permissions.

It cannot:
- grant worker capabilities
- modify Guardian authority
- bypass lease/fencing
- authorize production side effects
- fabricate successful worker output

Permission changes must still pass .okf/security/worker-permissions.md.

## 12. Relationship to Devourer

Devourer candidates affecting operational behavior must use production-helper evidence whenever the candidate risk surface matches the helper capabilities.

A Devourer candidate missing required runtime/security evidence remains unpromoted.

## 13. Release gate

A production-impacting change is not considered fully verified until:
- code evidence exists
- test evidence exists
- applicable security evidence exists
- applicable runtime evidence exists
- blocked/unproven checks are disclosed
- physical output is verified when media is involved

## 14. Absolute rule

production-helper exists to make verification routine, not ceremonial.

A green-looking report without real evidence is not a green system.
