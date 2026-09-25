# Skill: Worker Routing
id: worker-routing
version: 2.0.0
owner: Overseer / Compute Plane Team

## WHEN TO USE
Invoked by the runtime when a render job needs a qualified worker/provider assignment.

## REQUIRED INPUTS
- `userRole`: Server-authoritative caller role ("ADMIN", "OWNER", "EDITOR", "VIEWER")
- `jobPriority`: Priority level (1 - 5)
- `renderRequirements`: GPU/CPU, memory, workload, duration, network, and verification requirements

## REQUIRED ACCESS
- Permissions: `workers:read`, `workers:route`
- Tools: `ComputeRouter`, worker health/capability inspection, claim/lease APIs

## EXECUTION SEQUENCE
1. Inspect server-authenticated role; never trust client routing claims.
2. Submit hardware/workload requirements to ComputeRouter.
3. Reject providers that fail policy, health, capability, permission, lease, or fencing checks.
4. Claim a qualified worker with an execution token and bounded lease.
5. Return the selected provider/worker and routing evidence.

## DECISION RULES
- User role does not directly select a cloud vendor.
- ComputePolicy and WorkerCapability determine eligible providers.
- Failover stays within the same safety and verification boundary.
- Render completion is accepted only with a verified physical artifact.

## SAFETY BOUNDARIES
- Server-authoritative routing.
- Deny-by-default worker permissions.
- Monotonic lease/fencing semantics.
- F07 remains the authoritative media verification gate.
