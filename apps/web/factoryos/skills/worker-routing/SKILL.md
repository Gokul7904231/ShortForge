# Skill: Worker Routing
id: worker-routing
version: 1.0.0
owner: Overseer / Compute Plane Team

## WHEN TO USE
Invoked by the runtime to select the appropriate render worker queue based on user role, worker health, and capacity.

## REQUIRED INPUTS
- `userRole`: Server-authoritative caller role ("ADMIN", "OWNER", "EDITOR", "VIEWER")
- `jobPriority`: Priority level (1 - 5)

## REQUIRED ACCESS
- Permissions: `workers:read`, `workers:route`
- Tools: `get_worker_pool_health`, `claim_worker_slot`

## EXECUTION SEQUENCE
1. Inspect server-authenticated role (never trust client role).
2. Submit render requirements to ComputeRouter and evaluate eligible provider health/capacity.
3. Verify worker capability, lease/fencing state, and provider policy before claim.
4. Apply bounded failover only among qualified providers.
5. Return assigned provider/worker and execution token.
1. Inspect server-authenticated role (never trust client role).
3. If role is VIEWER or EDITOR, route to GitHub Actions Basic render pool.
4. Verify target worker health. If target is unhealthy, apply failover policy within permitted role bounds.
5. Return assigned worker pool and execution token.

## DECISION RULES

## SAFETY BOUNDARIES
- Strict server-authoritative role boundary.
