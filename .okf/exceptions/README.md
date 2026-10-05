# OKF Governance Exceptions

Exceptions are explicit, scoped, time-bounded records. They are not policy rewrites.

Each exception must satisfy .okf/schemas/exception-record.schema.json and name its approving authority, affected rule IDs, exact path scope, compensating controls, expiry, closure evidence, and status.

An exception documents a temporary authorized deviation; it never converts missing, contradictory, or UNPROVEN evidence into PASS.
