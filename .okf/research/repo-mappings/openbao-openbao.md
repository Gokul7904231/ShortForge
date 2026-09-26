# Repository Mapping: openbao/openbao

Status: F03 security boundary reference
Adoption: identity/lease/revocation concepts remain outside F03

Useful pattern: identity-based access, leases, renewal/revocation and auditability.

F03 mapping:
- F03 references assets logically.
- provider secrets, tokens and leases are not stored in AssetPlanIR.
- external execution adapters resolve authorized credentials under Guardian/capability controls.

URL: https://github.com/openbao/openbao
