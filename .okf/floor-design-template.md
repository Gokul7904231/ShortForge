# Floor Design Template — Five Questions + Governance Contract

Use this before introducing or substantially modifying a ShortForge floor.

## 0. Identity

- floor_id:
- floor purpose:
- owned inputs:
- owned outputs:
- downstream consumer:
- Guardian:
- Ascalon cognitive scope:
- worker specializations:

## 1. Which actions cannot be undone?

List every action.

| action | reversibility | risk | compensation | human approval |
|---|---|---|---|---|
| | REVERSIBLE / COMPENSATABLE / IRREVERSIBLE | LOW / MEDIUM / HIGH / CRITICAL | | |

Any irreversible action must have explicit authority and verification requirements.

## 2. What must happen before each action?

For every action define:

- preconditions
- required evidence
- required capability
- required authority
- state version assumptions
- fencing/resource assumptions
- policy requirements

The answer must be machine-checkable where practical.

## 3. What can each action produce?

Define:

- typed output
- evidence records
- receipts
- state changes
- artifact identities
- incident transitions
- failure outputs

Never make "the model said it succeeded" the output contract for a physical action.

## 4. Which step waits for a person?

Explicitly classify:

- never
- human approval when risk/threshold requires it
- always human

Model-generated requests are not human approvals.

## 5. What is all left?

List unresolved:

- side effects
- external calls
- race conditions
- replay risks
- stale leases
- boundary gaps
- compensation limits
- verification gaps
- escalation paths
- monitoring gaps

## 6. Action vocabulary

List all allowed executable actions.

Every action must have:

- actor/proposer set
- required authority
- capability
- reversibility
- risk
- preconditions
- postconditions
- failure transitions
- resource scope
- mutation scope

## 7. State machine

Define:

- normal states
- incident states
- degraded states
- escalation states
- human-intervention state
- close state

Define allowed transitions explicitly.

## 8. Trust model

Mark every data source:

- TRUSTED_SYSTEM_STATE
- VERIFIED_EVIDENCE
- DERIVED
- UNTRUSTED_EVIDENCE

No untrusted channel can directly grant authority.

## 9. Council

### Instructor
Knowledge and constraint role.

### Advisor
Strategy/trade-off role.

### Auditor
Independent proof role.

Define their allowed outputs as typed `CounselPacket` records.

## 10. Boundary

For each ingress/egress crossing define:

- source
- destination
- actor
- contract version
- authorization
- input/output hash
- artifacts
- lineage
- capability
- policy decision
- inspection results
- anomalies
- quarantine behavior

## 11. Healing

Define:

- FG-Healer
- Common Healer delegation path
- joint session identity
- resource mutation leases
- fencing epoch
- action reservation
- repair dependency graph
- checkpoints
- verification
- closure

Rule:

> Do not lock the incident. Lock the mutations.

## 12. Negative tests

Every floor should have tests proving that:

- cross-floor mutation is blocked
- untrusted evidence cannot become authority
- stale fencing is rejected
- duplicate mutation is suppressed
- conflicting mutation is serialized
- unverified repair cannot close an incident
- quarantine blocks propagation
- Auditor cannot mutate audited objects
- Ascalon cannot bypass Guardian
- workers cannot expand capability
- delegated healers cannot exceed scope
- historical evidence cannot be rewritten

## 13. Promotion gate

Before production:

- implementation exists
- contracts are typed
- tests pass
- observability exists
- rollback exists
- boundary evidence exists
- security negatives pass
- documentation matches executable truth
- current .okf sweep is recorded

