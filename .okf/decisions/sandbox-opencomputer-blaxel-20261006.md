# Sandbox Fabric — OpenComputer + Blaxel
Date: 2026-10-06
Issue: #228
PR: #230

## Decision

OpenComputer and Blaxel are accepted as real hosted Sandbox Fabric implementations behind the existing provider-neutral sandbox contract and ComputePool.

## Provider boundaries

### OpenComputer
- Credential: OPENCOMPUTER_API_KEY.
- Optional configuration: OPENCOMPUTER_API_URL, OPENCOMPUTER_TEMPLATE.
- SDK boundary: @opencomputer/sdk 2.3.x.
- Operations: authenticated probe, sandbox create/connect, command execution, binary upload/download, kill, reconciliation.

### Blaxel
- Credentials: BL_API_KEY, BL_WORKSPACE.
- Optional configuration: BLAXEL_SANDBOX_IMAGE, BLAXEL_REGION.
- SDK boundary: @blaxel/core 0.3.x.
- Operations: workspace-authenticated list, sandbox create/reuse/get/delete, process execution, binary filesystem transfer, reconciliation.

## Security and authority

1. Raw provider credentials remain server-side and are not committed, logged, placed in evidence, or sent through MCP arguments.
2. Both providers remain ADMIN-only in the compute connection catalog.
3. Both providers set productionWorkerEligible=false.
4. Provider completion never becomes artifact truth.
5. CAS and F07 remain the independent physical truth boundary.
6. Optional SDKs remain optional for ordinary FactoryOS typecheck/CI; live workflows install them explicitly.

## Qualification

Static implementation and contract qualification is separate from physical provider qualification.

Physical qualification requires:
- authenticated provider access;
- sandbox provisioning;
- real command execution;
- physical artifact generation;
- verifier-host download;
- independent CAS SHA-256/size verification;
- independent F07 physical verification;
- signed receipt verification;
- cleanup/termination.

No provider is considered physically qualified until that chain has a successful GitHub Actions evidence run.
