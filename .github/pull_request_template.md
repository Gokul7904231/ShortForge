## Description

Brief summary of the changes introduced in this pull request and the problems they solve.

## Type of Change

- [ ] `refactor`: Structural, architectural, or organizational change without behavior alteration
- [ ] `feature`: New functionality, provider, or capability
- [ ] `bug`: Bug fix or defect remediation

## Subsystem Impacted

- [ ] FactoryOS Control Plane (`apps/web/factoryos/core/*`)
- [ ] Distributed Compute Fabric (`apps/web/factoryos/core/compute/*`, `services/rendering-engine/*`)
- [ ] Token & Context Economy (`apps/web/ai/*`)
- [ ] Decision Intelligence Fabric (`apps/web/factoryos/core/intelligence/*`)
- [ ] F07 Release Guardian & Verification (`apps/web/factoryos/core/verification/*`)
- [ ] Publishing & Delivery (`apps/web/publishing/*`)
- [ ] Documentation & Repository Governance (`docs/*`, `scripts/*`)

## Operating Standard Compliance

- [ ] **CLAIM <= EVIDENCE**: All claims in this PR are backed by executable tests or physical evidence.
- [ ] **No Synthetic Success**: No mock fallback SHA-256 or mock publishing receipts in production paths.
- [ ] **Deterministic Typing**: All added or updated types pass strict TypeScript compilation.
- [ ] **Zero Absolute Machine Paths**: No `file:///` or machine-specific filesystem paths committed.

## Verification & Test Results

```bash
# Paste verification commands and exit codes:
npm run factoryos:typecheck
npm test
```

## Related Documentation

- Canonical Docs: `docs/...`
- Architecture Map: `docs/architecture/system-overview.md`


## Team Change Gate
- [ ] I completed the current .okf end-to-end sweep.
- [ ] I classified the change.
- [ ] Required Forgers were routed and produced evidence.
- [ ] Required security checks were run; BLOCKED/UNPROVEN states are disclosed.
- [ ] Every contradiction is preserved in the Team report with a proposed resolution.
- [ ] `Team/reports/pr-<number>.json` will be present before merge.
