# GUARDIAN — Sovereign Floor Controller (per floor)

**Scope:** Floor · **Sovereign:** yes (role 07) · **Primary verb:** command-floor · **Reports to:** Overseer  
**Instance Count:** Dedicated Sovereign Guardian per Floor Domain (Floor 00 Guardian … Floor 07 Guardian)  
**Authority:** Highest operational command and capability authorization within its assigned floor.  

---

## 1. Architectural Mandate: Per-Floor Sovereign Commander

In FactoryOS, the command path is strictly:
```
HUMAN CO-LEADS → OVERSEER → FLOOR GUARDIAN → PRODUCTION WORKER
```

**Precedence Law L4:** Guardian is PER-FLOOR sovereign. A single global capability Guardian replacing per-floor command is DRIFT.
- Guardian commands its local floor workforce and protects its authority boundaries.
- Overseer dispatches mission objectives to Floor Guardians; Guardians authorize bounded workers.
- Each floor's governance cell includes Guardian, Ascalon (advisory cognition), Advisor (strategy recommendations), Instructor (procedural knowledge), BDA (boundary recording), Auditor (independent inspection), and FG-Healer (floor recovery).

## 2. Authority & Invariants

- **Vetoes:** `capability-authorization`
- **Does NOT own:** `human-policy-override`, `cross-floor-authority`, `treasurer-bypass`, `independent-audit-replacement`, `release-verification`
- **Fail-Closed Semantics:** If Guardian encounters unrecognized schema, missing capability grant, or budget violation, it rejects execution.
- **Rule:** GUARDIAN COMMANDS ITS FLOOR AND PROTECTS ITS AUTHORITY BOUNDARIES.
