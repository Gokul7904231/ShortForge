
# ShortForge Production Helper

The production-helper directory is the routine engineering validation workspace for ShortForge / FactoryOS.

It is not a second source of truth and it is not a green-light generator.

## What is here

- combined/reports/ — P0 hardening, real Azure E2E, real runtime traces, security forensics
- semgrep/rules/ — ShortForge-specific static security rules
- semgrep/reports/ — recorded static-scan evidence
- strix/prompts/ — dynamic security-audit instructions

## Routine usage

Top process rule: complete the current .okf end-to-end decision sweep before choosing which helper checks to run.

For meaningful changes:

1. Review the current .okf tree end to end.
2. Inspect relevant .okf rules and repo mappings.
3. Inspect the relevant production-helper evidence.
4. Implement the smallest change.
5. Run targeted tests.
6. Run architecture / security tests where affected.
7. Run Semgrep for security-sensitive changes.
8. Run Strix when Docker is available.
9. Run staging / real-runtime proof when distributed or render behavior changes.
10. Record evidence and update .okf audits / decisions.

## Evidence discipline

Never convert:

- BLOCKED
- UNPROVEN
- STATIC WARNING
- NOT TESTED

into PASS.

Every report must preserve its evidence class.

## Current known helper posture

The most recent recorded security audit:
- Semgrep executed against 522 files.
- 75 static findings were recorded.
- Strix was UNPROVEN because Docker was unavailable.
- Vitest reported 168 suites and 776 tests passed in that audit.

These are historical recorded results, not current system status.

## Security rule

Production-helper may inspect, test, and report.

It must never:
- grant worker capabilities
- bypass Guardian
- bypass leases
- mark artifacts verified
- fabricate deployment success

## Definition of Done

A production-impacting change should have:

- code evidence
- test evidence
- security evidence where applicable
- runtime evidence where applicable
- explicit blocked / unproven items
- corresponding .okf decision updates when architecture changed

## Routine trigger matrix

| Change surface | Minimum routine evidence |
|---|---|
| Worker permissions | targeted capability tests + permission regression + Semgrep; Strix when Docker is available |
| Rendering / RenderFabric | targeted render tests + staging/runtime proof + physical artifact verification |
| Remote worker / callback | state-machine tests + replay/idempotency tests + staging proof |
| Security / network / filesystem | Semgrep + applicable adversarial tests + Strix when Docker is available |
| Quota / scheduling | lifecycle tests + concurrency / stale-cleanup tests |
| Architecture / control plane | architecture tests + relevant staging/runtime evidence |
| Devourer candidate affecting production | candidate evaluation + relevant helper evidence + explicit blocked/unproven accounting |
