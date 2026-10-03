# Ascalon / Overseer Dataset Specification

> Status: DATA PREPARATION CONTRACT
> Schema family: Existing Ascalon trajectory/data contracts
> Format: JSONL as the canonical exchange format

## 1. Dataset purpose

Create a specialized corpus that teaches Ascalon the operational cognition required for Overseer behavior while keeping execution authority outside the model.

The dataset must support:
- SFT;
- DPO/preference tuning;
- deterministic evaluation;
- replay;
- future verifiable-reward experiments.

## 2. Example unit

Each example should preserve, at minimum:

~~~json
{
  "trajectoryId": "...",
  "missionId": "...",
  "runId": "...",
  "schemaVersion": "1.0.0",
  "environment": {
    "environmentType": "PRODUCTION"
  },
  "observation": {
    "worldStateSnapshotId": "...",
    "inputPayloadHash": "...",
    "systemConstraints": {}
  },
  "decision": {
    "intent": "...",
    "selectedOption": "...",
    "rationale": "...",
    "uncertainty": {}
  },
  "authorization": {
    "requested": true,
    "authorized": false,
    "guardianDecision": "DENIED"
  },
  "execution": {},
  "outcome": {},
  "provenance": {
    "labelSource": "DETERMINISTIC_TEACHER",
    "synthetic": true,
    "simulation": false,
    "replayDeterministic": true
  }
}
~~~

The existing Ascalon Trajectory Format and data contracts remain the canonical field authority; this is a semantic subset, not a replacement schema.

## 3. Training views

### View A — Intent
Input:
- user request;
- recent context.

Target:
- operational intent;
- source/evidence requirement;
- clarification decision.

### View B — State assessment
Input:
- WorldState snapshot;
- cases;
- resources;
- mission state.

Target:
- grounded facts;
- unknowns;
- contradictions;
- severity;
- required probes.

### View C — Mission planning
Input:
- intent + state + constraints.

Target:
- minimal valid sub-DAG;
- floors;
- dependencies;
- parallelism;
- budgets;
- stop/verification criteria.

### View D — Governed action proposal
Input:
- selected plan.

Target:
- action proposal;
- capability requirement;
- authorization requirement;
- scope;
- evidence requirement.

### View E — Closed-loop supervision
Input:
- worker/case update.

Target:
- continue;
- pause;
- replan;
- recover;
- contain;
- escalate;
- complete.

### View F — Truthful reporting
Input:
- operational state.

Target:
- evidence-bounded status report without invented success.

## 4. Label sources

Allowed production-learning label sources:
- VERIFIED_OUTCOME;
- HUMAN_EXPERT;
- DETERMINISTIC_TEACHER.

Non-learning or isolated curriculum sources:
- HEURISTIC_FALLBACK;
- SIMULATION_PSEUDO;
- malformed/mock outputs unless explicitly marked as rejection examples.

## 5. Hard-negative families

### Authority
- self-authorization;
- capability invention;
- Guardian bypass;
- release bypass;
- hierarchy inversion.

### Distributed execution
- expired lease accepted;
- stale fencing token accepted;
- duplicate worker completion treated as authoritative;
- worker state trusted without fencing.

### Truth/evidence
- provider accepted ≠ physical success;
- generated ≠ verified;
- verified ≠ released;
- missing receipt ≠ success.

### Planning
- keyword-only floor selection;
- unnecessary full-pipeline execution;
- wrong parallelization;
- ignoring dependencies;
- ignoring budget.

### Safety
- continuing after a blocking condition;
- hiding anomalies;
- suppressing escalation;
- unbounded repair;
- simulation treated as production.

### Knowledge
- stale WorldState presented as current;
- memory overriding current authoritative state;
- unsupported external claim treated as factory truth.

## 6. Preference-pair design

Each pair should differ on one meaningful behavioral dimension.

Example:

Chosen:
F06 is constrained by current GPU availability. Request provider-capability evaluation through the authorized routing boundary, then require physical artifact evidence before claiming completion.

Rejected:
F06 can use any GPU provider available, so dispatch immediately and mark the render successful when the provider accepts it.

The chosen response is preferred because it is evidence-grounded, governance-aware, and does not collapse provider admission into physical truth.

## 7. Split policy

Do not split randomly by row.

Partition by:
- mission family;
- scenario family;
- incident template;
- synthetic seed family;
- other semantic grouping.

Near-duplicates must not appear across train and validation/test.

Held-out evaluation should test unseen combinations of:
- intent;
- floor;
- resource condition;
- failure;
- authority requirement.

## 8. Contamination rules

Reject on:
- secret leakage;
- credentials;
- unnecessary PII;
- unverifiable success claims;
- authorization contradictions;
- schema-invalid decision data;
- simulation mislabeled as production;
- duplicate trajectory fingerprint;
- missing provenance;
- corrupted artifact references.

## 9. Data balance

Avoid overrepresenting successful full-pipeline missions.

Deliberately cover:
- normal planning;
- ambiguity;
- partial success;
- blocked states;
- degraded resources;
- retries;
- failed execution;
- verification failure;
- escalation;
- safe no-op/stand-down;
- replan;
- cancellation/termination.

The goal is to teach a control policy, not a completion bias.

## 10. Suggested corpus allocation

These are target proportions, not claims about current data volume:

| Family | Target share |
|---|---:|
| Intent + clarification | 10% |
| WorldState grounding | 15% |
| Mission planning | 20% |
| Governance/action proposals | 15% |
| Supervision + lifecycle | 15% |
| Failure/recovery | 15% |
| Truth/evidence reporting | 10% |

Final volumes must come from actual verified data.

## 11. Training serialization

### SFT
Use system instructions, user mission prompts, structured context, and canonical assistant decisions/plans.

### DPO
Use prompt, chosen, rejected, with both candidates traceable to the same scenario and evidence.

### Replay/evaluation
Retain full structured trajectory objects rather than flattening everything into chat text.

## 12. Provenance manifest

Every exported shard should record:
- datasetVersion;
- source commit;
- trajectory IDs/ranges;
- ontology versions;
- contract versions;
- generator version;
- validator version;
- split policy version;
- content digest.

## 13. Export gate

No training shard should be emitted unless:
1. schema validation passes;
2. security scan passes;
3. provenance validation passes;
4. training eligibility is explicit;
5. contamination checks pass;
6. split policy passes;
7. hard-negative tagging is valid;
8. manifest digest is produced.

## 14. Boundary rule

Do not export hidden private chain-of-thought.

Train on:
- observable decisions;
- approved structured rationales;
- action selection;
- evidence references;
- tool calls/results;
- state transitions;
- outcomes;
- corrections.

The learning target is operational behavior and decision quality.
