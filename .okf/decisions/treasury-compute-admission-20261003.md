# Decision — Treasurer Compute Admission

Date: 2026-10-03
Decision: Treasurer becomes the economic admission boundary for canonical F06 physical rendering.

## Context

Wave 1 established a deterministic Treasurer with durable accounting, but economic control was not connected to physical compute. F06 already had the canonical RenderFabric -> ComputeGateway -> ComputeRouter path.

## Chosen boundary

Overseer -> Treasury reserve -> ComputeRouter -> Worker -> artifact -> F07 -> Treasury settle/release

This preserves:

- Overseer as the only sovereign command authority;
- Guardian as capability authority;
- ComputeRouter as physical placement authority;
- Worker as execution-only;
- Slayer as enforcement;
- Healer as bounded recovery;
- F07 as evidence/release authority.

## Rejected alternatives

### Treasurer as scheduler
Rejected because economic admission and physical placement are separate responsibilities.

### Worker-owned budgets
Rejected because workers must not own global economic authority.

### F06 self-settlement
Rejected because production settlement must not bypass independent verification.

### LLM-controlled Treasury
Rejected because hard economic invariants must remain deterministic.

## Consequences

Treasurer now has a real runtime control point for F06 renders. It can deny new discretionary resource consumption, bound reservation size, and reconcile measured use without choosing the provider itself.

Legacy economic paths remain during staged migration.