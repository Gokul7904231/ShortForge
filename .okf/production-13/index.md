# ShortForge 13-Layer Operational Quality Framework

**Status:** OPERATIONAL QUALITY FRAMEWORK  
**Subordinate to:** `.okf/charter.md`  
**Core Principle:** 13 layers are audit lenses, not sovereign roles. `sovereignRolesCreated = false`.

---

## Purpose

This directory operationalizes the 13-layer production audit overlay without adding a single sovereign role or altering the founding authority tree in `.okf/charter.md`.

Every layer (`L01`–`L13`) is owned by existing charter roles/subsystems, carries an explicit Definition of Done, and may only be marked `PASS` when backed by non-empty physical `evidence[]` and executable `tests[]`.

- Machine registry: [`./layer-registry.json`](./layer-registry.json)
- Scorecard summary: [`./scorecard.md`](./scorecard.md)
- Layer specs: [`L01.md`](./L01.md) … [`L13.md`](./L13.md)
- Generated audit: [`../../docs/production-13/AUDIT-13.md`](../../docs/production-13/AUDIT-13.md) (via `node scripts/audit/production-13.mjs`)
