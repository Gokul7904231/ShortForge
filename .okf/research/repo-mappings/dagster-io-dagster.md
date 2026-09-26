# Repository Mapping: dagster-io/dagster

Status: selected F03 graph reference
Adoption: explicit asset dependency semantics

Dagster models assets with stable keys and explicit dependency declarations.

F03 mapping:
- AssetPlanIR dependency edges are first-class.
- dependency scene and asset identity are checked against the current plan.
- dependency fingerprints enable deterministic downstream invalidation.

F03 does not adopt Dagster orchestration as a second production control plane.

URL: https://github.com/dagster-io/dagster
