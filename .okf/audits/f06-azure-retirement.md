# Floor 06 — Azure Retirement & Render Fabric Consolidation Audit

**Status:** CURRENT / PRE-MERGE ARCHITECTURE AUDIT  
**Branch:** `feat/f06-unified-render-fabric`

## Decision

Azure VM rendering is retired from the active ShortForge/FactoryOS architecture.

Floor 06 now has one authoritative render entry point:

```text
F05 RenderIntent
  ↓
F06 RenderFabric
  ↓
ComputeGateway
  ↓
ComputeRouter
  ↓
Qualified provider / worker
  ↓
Physical artifact
  ↓
CAS + F07 verification
```

## Removed active Azure surface

- Azure VM IaC and policy files
- Azure worker manager / FinOps guard
- Azure admin worker service and VM setup script
- Azure-specific render dispatch from generation and F06
- Azure-specific worker-pool routing rules
- Azure-specific integration/e2e tests
- Azure-specific telemetry
- Azure-specific renderer analytics
- Azure-specific regression mission
- Azure-specific worker routing skills
- Azure-specific environment variables

The repository tree contains no active path with `azure` in its filename on this branch.

## Canonical ownership

- Compiler planning: `apps/web/factoryos/core/fabric/RenderFabric.ts`
- Provider routing: `apps/web/factoryos/core/compute/router/ComputeRouter.ts`
- Provider registration: `apps/web/factoryos/core/compute/gateway/ComputeGateway.ts`
- Worker lifecycle / lease / fencing: `apps/web/factoryos/core/fabric/`
- Artifact identity: CAS
- Final media gate: F07 / `VerificationEngine`

The deleted legacy `apps/web/factoryos/core/rendering/RenderFabric.ts` is not replaced by another compatibility implementation.

## Provider model

The provider layer is vendor-neutral. Provider identity does not define authority.

Eligible providers are selected from capability, health, policy, permission, lease, and fencing state. AMD integration remains the next concrete physical worker integration required for the distributed golden mission.

## Remaining compatibility surfaces

Generic persistent-worker and GitHub Actions adapters remain because they are provider-neutral compute mechanisms.

Some historical audit/report files may still contain the string Azure. Those records are retained for provenance and are not executable architecture or active provider configuration.

## Validation required before merge

1. TypeScript typecheck
2. FactoryOS/Vitest suite
3. Canonical RenderFabric tests
4. Distributed Render Fabric tests
5. Later physical AMD distributed golden mission

## Rollback

Reject this change set if CI shows a regression in canonical F06 routing, artifact receipt enforcement, provider failover, F07 verification, or worker lease/fencing semantics.
