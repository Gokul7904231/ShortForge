# SHORTFORGE CONTROL & GOVERNANCE CHARTER

**Status:** CANONICAL-FOUNDING
**Version:** 1.0.0
**Rank:** ABOVE `.okf/architecture.md`. All other documents, registries, code and tests MUST conform.
**Authority:** Human Co-Leads
**Amendment:** Only by explicit Human Co-Lead approval. Adding a sovereign role requires an amendment.

---

## 1. The Authority Tree (absolute)

```
HUMAN CO-LEADS  (supreme: policy, budget, emergency stop, appointments)
└── OVERSEER  (global command & coordination; decides, does not execute)
    │
    ├── FACTORY-WIDE ROLES
    │   ├── TREASURER   economic gate; obeys only Overseer discretionary; immutable rules
    │   ├── SLAYER      investigate → classify → prove; bounded containment only
    │   ├── HEALER      recovery execution (bounded, fenced, idempotent)
    │   ├── REMAKER     surgical reconstruction (CAP_REMAKER_REPAIR, scoped, budgeted)
    │   └── COMMS       structured event bus; transports, NEVER commands
    │
    └── PER FLOOR  (F00 … F07), each floor:
        ├── GUARDIAN        floor sovereign commander (Overseer → Guardian → Worker)
        │   ├── ASCALON     cognition FOR the Guardian (advisory, never authority)
        │   ├── ADVISOR     recommends strategy (no command, no spend)
        │   ├── INSTRUCTOR  procedural knowledge & lessons (feeds Ascalon)
        │   ├── BDA         boundary inspection → records to Auditor
        │   ├── AUDITOR     independent examination  ≠  F07
        │   ├── FG-HEALER   floor-local recovery; joints with global Healer
        │   └── WORKERS     execute only, bounded & authorized
        │
        └── F07  release-integrity boundary (independent; Auditor/worker/ReMaker
                 reports can NEVER replace its physical verification)
```

## 2. Precedence Laws

- **L1.** Human Co-Leads > Overseer > all execution. Emergency stop beats everything.
- **L2.** Overseer commands and coordinates but NEVER executes production work and NEVER bypasses a regulator veto.
- **L3.** The five factory-wide roles are co-equal, domain-sovereign, and are NEVER production floors.
- **L4.** Guardian is PER-FLOOR sovereign (Floor 00 Guardian … Floor 07 Guardian). A single global capability Guardian replacing per-floor command is DRIFT.
- **L5.** Auditor ≠ F07. Auditor examines evidence; F07 establishes release integrity. Neither replaces the other. Merging them is DRIFT.
- **L6.** Slayer's primary verb is INVESTIGATE, not KILL. Containment is bounded and only within granted capability.
- **L7.** Treasurer obeys only Overseer for discretionary commands; immutable economic rules may always deny/freeze/release/reconcile. Guardian capability and Treasurer economic approval are INDEPENDENT gates.
- **L8.** Ascalon thinks FOR the Guardian (per-floor cognition). Advisory, never authority. A factory-wide second Overseer is DRIFT.
- **L9.** Comms transports structured events; never commands, authorizes, spends, repairs, or verifies.
- **L10.** Advisor recommends; Instructor teaches; BDA inspects boundaries and records to Auditor; FG-Healer does floor-local recovery and joints with global Healer. None grants itself authority.
- **L11.** F03 ∥ F04 converge at F05; otherwise floors are sequential F00→F07. Workers execute only.
- **L12.** NO ACCRETION. No new sovereign role without a Human-approved charter amendment. Devourer/AER/GLiDE/SCL/fencing/CAS/RenderFabric/ComputeRouter are SUBSYSTEMS, not sovereigns.
- **L13.** `CLAIM <= EVIDENCE` and `LEARNING != PROOF` at every layer. Execution success ≠ verified success.

## 3. Fundamental governance principle

**Command ≠ Authorization ≠ Resource Allocation ≠ Execution ≠ Verification.**

## 4. Subsystem re-homing

| Subsystem | Parent | Mode |
|---|---|---|
| Ascalon | Guardian | advisory cognition, per-floor |
| BDA | Guardian | boundary inspection → records to Auditor |
| FG-Healer | Guardian | floor-local recovery, joints with global Healer |
| F07 | (independent boundary) | release integrity; never replaceable |
| Devourer | Instructor + Overseer | propose-only; promotion = charter amendment |
| AER / GLiDE / SCL | Ascalon | advisory, shadow-only |
| Fencing / CAS / RenderFabric / ComputeRouter | Guardian | execution infrastructure |

## 5. Amendment rule

Any change to the sovereign set, scopes, or precedence laws requires:
1. Human Co-Lead approval recorded in `.okf/decisions.md`.
2. Charter version bump + re-sync of `authority-registry.json` charter hash.
3. `authority-charter-drift.test.ts` green.

**END OF CHARTER**
