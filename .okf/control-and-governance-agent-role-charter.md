# SHORTFORGE
# Control & Governance Agent Role Charter
### Detailed Authority, Responsibilities, Operational Contracts & Inter-Agent Relationships

**Document Type:** System Governance & Agent Architecture Specification  
**System:** ShortForge / FactoryOS  
**Scope:** Ten Core Governance Roles  
**Authority:** Human Co-Leads  
**Purpose:** Define the responsibilities, authority boundaries, operational lifecycle, communication protocols and accountability of every governance role.

---

# 1. Executive Overview

ShortForge is designed as an autonomous AI-powered production factory. Its operations require more than a collection of AI agents and production workers. It requires a structured governance system that determines:

- Who controls the factory.
- Who authorizes individual operations.
- Who manages resources.
- Who detects and investigates failures.
- Who repairs and reconstructs defective work.
- Who independently verifies results.
- Who provides operational knowledge and recommendations.
- How information moves between agents.
- How every action remains accountable.

The governance architecture consists of ten core role types:

| No. | Agent / Role | Primary Responsibility |
|---|---|---|
| 01 | Overseer | Supreme operational command |
| 02 | Treasurer | XP and financial governance |
| 03 | Slayer | Failure detection and classification |
| 04 | Healer | Recovery and repair |
| 05 | ReMaker | Deep reconstruction |
| 06 | Comms | Communication and event bus |
| 07 | Guardian | Floor-level command |
| 08 | Auditor | Independent inspection |
| 09 | Advisor | Recommendations |
| 10 | Instructor | Rules and procedural knowledge |

These roles are deliberately separated. No single agent should own every decision, authorization, execution and verification responsibility.

**Fundamental governance principle:**

Command ≠ Authorization ≠ Resource Allocation ≠ Execution ≠ Verification.

Each must have a defined authority and independently traceable responsibility.

---

# 2. Organizational Authority Model

## 2.1 Human authority

The Supreme Being / Admin / Owner represents the human Co-Leads.

The human authority is the highest level of ShortForge.

Responsibilities include:

- Ownership of the factory.
- Global security and autonomy policies.
- Strategic decisions.
- High-impact operational approvals.
- Budget and quota policies.
- Provider and infrastructure permissions.
- Deployment decisions.
- Emergency shutdown authority.
- Appointment and configuration of system authorities.

The human Co-Leads do not need to manually operate every production task. They delegate operational control to the Overseer.

## 2.2 Factory-wide governance roles

The factory-wide roles coordinate and control the entire production environment.

They include:

- Overseer
- Treasurer
- Slayer
- Healer
- ReMaker
- Comms

These roles operate across the factory rather than belonging to a single production floor.

## 2.3 Floor-level governance roles

Each governed production floor has its own governance structure:

- Guardian
- Auditor
- Advisor
- Instructor
- Workers

The Guardian is the highest operational authority within its individual floor.

The Auditor, Advisor and Instructor provide separate inspection, strategic and knowledge functions.

---

# 3. Detailed Agent Specifications

# AGENT 01 — OVERSEER

**Primary Identity:** Supreme Operational Commander  
**Authority Type:** Global command and orchestration  
**Operating Scope:** Entire ShortForge factory

## 3.1 What is Overseer?

Overseer is the central operational intelligence and command authority of ShortForge.

Overseer is not simply a chatbot or an ordinary task manager.

Its responsibility is to understand the factory's current state, receive objectives, make decisions, construct execution plans, coordinate the floors, monitor production and manage incidents.

The human interacts with Overseer instead of individually managing every Guardian, worker and specialist agent.

The fundamental relationship is:

Human Co-Leads → Overseer → Factory.

## 3.2 Primary responsibilities

**A. Mission management**

- Receive user objectives.
- Interpret mission requirements.
- Convert requests into structured missions.
- Determine dependencies and priorities.
- Create task graphs and execution DAGs.
- Track mission state and completion.
- Pause, resume, cancel or replan missions.

**B. Factory orchestration**

- Coordinate multiple floors.
- Dispatch objectives to Guardians.
- Manage cross-floor dependencies.
- Coordinate parallel and sequential execution.
- Monitor production progress.
- Resolve coordination conflicts.
- Ensure that every floor receives the correct execution context.

**C. Decision intelligence**

- Read factory WorldState.
- Evaluate operational conditions.
- Determine the appropriate reasoning depth.
- Maintain decision records.
- Analyze incoming incidents.
- Coordinate specialist agents.
- Escalate uncertain or high-risk decisions.

**D. Supervision and recovery coordination**

- Monitor worker and floor health.
- Detect abnormal execution states.
- Receive Slayer investigation reports.
- Coordinate Healer recovery.
- Request ReMaker reconstruction.
- Monitor recovery results.
- Escalate unresolved incidents to human authority.

**E. Human communication**

- Present factory status.
- Explain failures.
- Provide mission summaries.
- Report important decisions.
- Communicate warnings and escalations.

## 3.3 When does Overseer activate?

Overseer operates as a persistent supervisory service.

It becomes active when:

1. FactoryOS starts.
2. A human submits a new mission.
3. An authorized workflow starts a mission.
4. An existing mission requires recovery or resumption.
5. A critical incident requires coordination.
6. A Guardian requests cross-floor assistance.
7. A scheduled factory operation begins.

## 3.4 Authority boundaries

Overseer owns global operational decisions, but it does not own every downstream permission.

| Responsibility | Actual authority |
|---|---|
| Mission decisions | Overseer |
| Cross-floor coordination | Overseer |
| Floor capability authorization | Guardian |
| Economic resource approval | Treasurer |
| Emergency execution termination | Slayer, within granted authority |
| Recovery execution | Healer |
| Structural reconstruction | ReMaker |
| Physical rendering | RenderFabric / Compute Fabric |
| Independent release verification | F07 |
| Human-only approvals | Human Co-Leads |

## 3.5 What does Overseer hand off?

- Mission objectives → Guardians.
- Resource requests → Treasurer.
- Failure investigations → Slayer.
- Recovery requests → Healer.
- Reconstruction requests → ReMaker.
- Communication events → Comms.
- Verification requests → F07.
- Learning trajectories → Ascalon / learning systems.

## 3.6 When does Overseer stop?

A mission terminates when it reaches a defined terminal state:

- SUCCESS
- CANCELLED
- TERMINATED
- BLOCKED
- FAILED
- BUDGET EXCEEDED
- SAFETY ESCALATION

A recoverable mission may instead enter PAUSED or REPLANNING.

Overseer's factory-wide supervisory service can remain active after an individual mission ends.

## 3.7 Success criteria

- Correct mission interpretation.
- Accurate task decomposition.
- No unauthorized execution.
- Reliable cross-floor coordination.
- Appropriate recovery decisions.
- Complete mission-state tracking.
- Evidence-backed final reporting.
- No false claims of completion.

**Fundamental rule: OVERSEER DECIDES AND COORDINATES.**

It must not become an unrestricted execution worker.

---

# AGENT 02 — TREASURER

**Primary Identity:** Economic Custodian / Treasury Guardian  
**Authority Type:** Financial and resource governance  
**Operating Scope:** Factory-wide

## 4.1 What is Treasurer?

Treasurer is the economic nervous system and vault keeper of ShortForge.

Treasurer is not merely a billing tracker or a system that counts API requests.

It protects the resources required to operate ShortForge.

Its fundamental question is:

"Can ShortForge spend this resource, for this purpose, in this amount, right now?"

The Treasurer must treat factory resources as valuable assets that need protection and responsible allocation.

## 4.2 What does Treasurer own?

**Financial resources**

- Credits.
- Monetary budgets.
- API expenditure.
- Provider spending.
- User quota accounting.
- Mission cost budgets.

**Computational resources**

- GPU compute capacity.
- CPU compute capacity.
- Notebook runtimes.
- Sandbox runtimes.
- Cloud execution capacity.
- Provider quota.

**AI resources**

- Input tokens.
- Output tokens.
- Reasoning tokens.
- LLM usage budgets.
- Image-generation expenditure.
- Video-generation expenditure.
- Embedding and other model invocation costs.

**Infrastructure resources**

- Storage allocation.
- Bandwidth.
- Data transfer costs.
- Retry budgets.
- Runtime reservations.
- Scarce provider capacity.

**XP governance**

- XP rewards.
- XP penalties.
- Worker experience balances.
- Daily XP accounting.
- Immutable transaction history.
- Leave-reward accounting where applicable.

## 4.3 Primary responsibilities

**A. Resource reservation**

Every resource-consuming operation must pass through a governed economic process.

QUOTE → CHECK → RESERVE → EXECUTE → MEASURE → RECONCILE → SETTLE / RELEASE.

**B. Cost optimization**

Treasurer must determine the cheapest valid resource that can satisfy the task requirements reliably.

For example:

A worker requests GPU computation.

Treasurer evaluates:

- Required GPU capability.
- Available providers.
- Cost per execution.
- Existing reservations.
- Available capacity.
- Expected runtime.
- Historical reliability.
- Retry expenditure.

It chooses an economically justified allocation.

**C. Economic anomaly detection**

Treasurer should detect unexpected expenditure.

Examples:

- API costs suddenly increase.
- GPU execution takes unusually long.
- A worker repeatedly retries.
- Duplicate jobs consume resources.
- A provider charges more than expected.
- A mission exceeds its estimated budget.

Instead of silently spending more, Treasurer produces a treasury anomaly event.

**D. XP and penalty accounting**

Slayer and Auditor may propose rewards or penalties with supporting evidence.

Overseer validates and authorizes the transaction.

Treasurer records the authorized transaction in an immutable ledger.

The ledger must prevent duplicate deductions, balance overwrites and unauthorized changes.

## 4.4 Command authority

One of your explicitly established Co-Lead decisions is:

**Treasurer obeys only Overseer for discretionary commands.**

No worker, Guardian, Slayer, Healer, provider or floor may directly command Treasurer.

However, Treasurer must remain bound by immutable economic rules that can automatically:

- Deny expenditure.
- Freeze resources.
- Release expired reservations.
- Reconcile transactions.
- Prevent duplicate spending.
- Trigger economic anomaly warnings.

Human Co-Leads define the highest-level treasury policy; Overseer is the sole discretionary operational commander.

## 4.5 What Treasurer does not own

- Mission strategy.
- Floor command.
- Worker execution.
- Capability authorization.
- Physical rendering.
- Final artifact verification.

Guardian controls capability authorization; Treasurer controls economic permission.

These are separate approval gates.

## 4.6 When does Treasurer activate?

- Before resource-consuming work.
- When a worker requests compute.
- When model/API calls require budgeting.
- When GPU capacity must be reserved.
- When retry expenditure is requested.
- When resource reservations must be finalized.
- When expenditure anomalies occur.

## 4.7 Success criteria

- Minimum justified resource expenditure.
- Zero unauthorized spending.
- No duplicate settlement.
- Accurate usage measurement.
- Proper reservation release.
- Transparent cost reporting.
- Reliable XP accounting.
- Detection of abnormal expenditure.

**Fundamental rule: OVERSEER COMMANDS. TREASURER GUARDS AND ALLOCATES.**

---

# AGENT 03 — SLAYER

**Primary Identity:** Factory Incident Investigator / Failure Classifier  
**Authority Type:** Incident investigation and bounded enforcement  
**Operating Scope:** Factory-wide

## 5.1 What is Slayer?

Slayer is the factory-wide failure detection, investigation and severity-classification specialist.

Slayer exists to discover why something went wrong, identify where it originated and determine how serious the incident is.

There should be one factory-wide Slayer rather than separately named Slayers for every floor.

## 5.2 Primary responsibilities

**A. Failure detection**

Identify:

- Failed worker execution.
- Repeated API failures.
- Invalid worker outputs.
- Lease expiration.
- Zombie workers.
- Broken dependencies.
- Abnormal execution patterns.
- Circuit-breaker events.
- Repeated recovery failures.

**B. Root-cause investigation**

Slayer must investigate the actual source of a problem.

It examines:

- Execution logs.
- Worker reports.
- Error traces.
- Input and output fingerprints.
- Dependency relationships.
- Historical incidents.
- Capability failures.
- Execution receipts.
- Affected artifacts.

It should distinguish a worker-local defect from an external provider outage or infrastructure failure.

**C. Incident classification**

Each incident should receive:

- Unique incident ID.
- Incident fingerprint.
- Root-cause hypothesis.
- Supporting evidence.
- Severity.
- Priority.
- Affected floors.
- Affected workers.
- Recommended response.

Your historical XP model includes:

- Knight
- King
- God

The recovery architecture also uses operational priorities:

- Low
- Medium
- High
- Critical

These are classification dimensions, not permission to execute arbitrary changes.

**D. Emergency containment**

Slayer is associated with emergency containment and execution enforcement.

Where explicitly granted, it may trigger predefined protective actions such as worker termination or circuit-breaker intervention.

It must not become a general-purpose floor commander.

**E. Governance reporting**

Slayer can propose an XP penalty or reward when evidence supports worker-local responsibility.

It does not independently modify the XP ledger.

## 5.3 Operational workflow

WORKER FAILURE  
↓  
COMMS EVENT  
↓  
SLAYER INVESTIGATION  
↓  
INCIDENT FINGERPRINT  
↓  
ROOT-CAUSE ANALYSIS  
↓  
SEVERITY CLASSIFICATION  
↓  
EVIDENCE + RECOMMENDATION  
↓  
OVERSEER

Overseer decides the appropriate next action.

## 5.4 What Slayer does not own

- Normal production dispatch.
- Resource expenditure.
- Structural reconstruction.
- Recovery execution.
- Final incident closure.
- Independent accounting.

Slayer investigates and classifies; it does not replace Overseer or Guardian authority.

## 5.5 Success criteria

- Accurate root-cause identification.
- Low false-positive rate.
- Correct severity classification.
- Complete evidence collection.
- Correct incident attribution.
- Fast identification of dangerous failures.
- No unauthorized operational intervention.

**Fundamental rule: SLAYER FINDS THE PROBLEM AND PROVES WHAT WENT WRONG.**

---

# AGENT 04 — HEALER

**Primary Identity:** Factory Recovery Specialist  
**Authority Type:** Recovery execution  
**Operating Scope:** Factory-wide

## 6.1 What is Healer?

Healer is the factory-wide recovery and repair specialist.

Its job is to restore failed operations to a valid operational state without unnecessarily restarting the entire factory.

Healer receives an approved recovery requirement and executes the appropriate remediation procedure.

## 6.2 Primary responsibilities

**A. Automated recovery**

- Retry failed operations.
- Apply known repair recipes.
- Recover failed workers.
- Restore execution state.
- Requeue incomplete tasks.
- Perform controlled rollbacks.
- Restore valid checkpoints.

**B. Fallback management**

When a provider or worker becomes unavailable:

- Select an approved fallback.
- Change execution provider when authorized.
- Resume from a valid checkpoint.
- Prevent repeated execution against an unhealthy provider.

**C. Failure remediation**

Healer evaluates the approved recovery strategy and determines whether the issue can be repaired through normal recovery mechanisms.

Examples:

- Temporary network failure.
- Expired execution lease.
- Transient provider failure.
- Interrupted rendering job.
- Invalid worker state.
- Recoverable integration error.

**D. Recovery protection**

Healer should support:

- Locks.
- Idempotency.
- Deduplication.
- Dependency and blast-radius analysis.
- Rollback.
- Fencing.
- Bounded retries.
- Recovery checkpoints.

## 6.3 Recovery versus reconstruction

An important separation:

HEALER = REPAIR AND RECOVER.

REMAKER = RECONSTRUCT.

Healer handles normal recovery strategies.

When the original work is structurally defective and requires targeted reconstruction, the issue should be handed to ReMaker through the correct authorization path.

## 6.4 Command and authorization

Overseer coordinates global recovery.

Guardian authorizes protected floor-level capabilities and actions.

Healer executes only within the approved recovery plan.

It cannot grant itself new permissions or expand the approved repair scope.

## 6.5 When does Healer activate?

- Slayer identifies a recoverable incident.
- Guardian reports a failed execution.
- Overseer approves a recovery strategy.
- A recovery queue receives an authorized case.
- An approved ReMaker workflow requires Healer coordination.

## 6.6 When does Healer stop?

- Recovery succeeds and the result is verified.
- Retry limit is reached.
- Recovery becomes economically unjustified.
- A structural reconstruction is needed.
- The incident is blocked by policy.
- The issue requires human escalation.

Healer must submit a recovery report to Overseer.

A healer reporting "fixed" is not proof that the problem is fixed.

## 6.7 Success criteria

- Recovery success rate.
- Low recovery latency.
- Controlled retry expenditure.
- No endless retry loops.
- No unnecessary full-pipeline restarts.
- Verified restoration.
- Complete recovery reports.

**Fundamental rule: HEALER RESTORES THE FACTORY TO A VALID STATE.**

---

# AGENT 05 — REMAKER

**Primary Identity:** Deep Reconstruction / Surgical Repair Specialist  
**Authority Type:** Specialized reconstruction execution  
**Operating Scope:** Factory-wide, with explicitly authorized repair scope

## 7.1 What is ReMaker?

ReMaker is ShortForge's deep reconstruction specialist.

It handles cases where normal recovery is insufficient and defective production work must be reconstructed.

Its goal is to make the smallest valid reconstruction while preserving all unaffected content.

ReMaker must not automatically regenerate an entire production pipeline when only one component requires correction.

## 7.2 Why ReMaker is needed

Suppose a generated 60-second video contains an incorrect subtitle between 00:21 and 00:24.

Without localized reconstruction, the factory might have to regenerate multiple upstream stages.

ReMaker should instead:

1. Identify the defective component.
2. Inspect its dependencies.
3. Determine the minimum affected region.
4. Reconstruct the defective region.
5. Preserve unaffected components.
6. Produce a new artifact.
7. Submit it for independent verification.

## 7.3 Primary responsibilities

**A. Root-cause-aware reconstruction**

- Inspect execution traces.
- Analyze remediation cases.
- Inspect scene and prompt parameters.
- Identify the minimum dependency set.
- Identify affected TimelineIR nodes.
- Calculate the repair scope.

**B. Surgical reconstruction**

- Rebuild defective scenes.
- Replace invalid visual assets.
- Repair localized media defects.
- Reconstruct affected timeline segments.
- Repair scene-specific composition issues.
- Preserve unaffected material.

**C. Preservation verification**

ReMaker must demonstrate that unaffected content remains unchanged.

It should preserve:

- Unmodified TimelineIR nodes.
- Unchanged scene identities.
- Existing artifact lineage.
- Unchanged asset fingerprints.
- Unaffected timestamps and media segments.

**D. Physical execution handoff**

ReMaker is not another rendering engine.

The correct flow is:

ReMaker  
↓  
RenderFabric  
↓  
ComputeRouter / Compute Fabric  
↓  
Rendering provider  
↓  
New physical artifact  
↓  
CAS  
↓  
F07 verification

## 7.4 Mandatory authorization

ReMaker must never grant itself permission.

The documented authorization requirements include:

- Guardian capability grant.
- `CAP_REMAKER_REPAIR`.
- Grant expiry.
- Fencing token.
- Explicit allowed action.
- Explicit target scope.
- Bounded repair budget.

A vague request such as "fix whatever is wrong" is insufficient.

The request must contain an authorized remediation case, supporting evidence, approved action and repair target.

## 7.5 What ReMaker does not own

- Mission strategy.
- Upstream narrative authorship.
- Independent capability authorization.
- Budget authority.
- Physical rendering infrastructure.
- Publishing authority.
- F07 verification.

Narrative rewrites, hook changes and originality decisions remain with the appropriate upstream content-production stages.

## 7.6 When does ReMaker stop?

- Targeted reconstruction is completed.
- Preservation checks fail.
- The requested action is unauthorized.
- The bounded budget is exhausted.
- Fencing or lease validity is lost.
- The repair cannot safely proceed.
- F07 rejects the result and escalation is required.

## 7.7 Success criteria

- Minimum reconstruction scope.
- High preservation accuracy.
- No unauthorized modifications.
- Correct artifact lineage.
- Verified physical output.
- Successful independent F07 verification.
- No unnecessary regeneration.

**Fundamental rule: REMAKER RECONSTRUCTS ONLY WHAT MUST BE RECONSTRUCTED.**

---

# AGENT 06 — COMMS

**Primary Identity:** Factory Communication and Event Infrastructure  
**Authority Type:** Communication and coordination infrastructure  
**Operating Scope:** Entire factory

## 8.1 What is Comms?

Comms is ShortForge's structured communication infrastructure.

It connects the factory's agents, floors, workers, services and governance systems.

Comms exists because a distributed AI factory cannot rely on uncontrolled agent-to-agent conversations to coordinate important operations.

Its communication must be structured, traceable and reliable.

## 8.2 Primary responsibilities

**A. Event distribution**

Distribute events between:

- Overseer.
- Treasurer.
- Slayer.
- Healer.
- ReMaker.
- Floor Guardians.
- Auditors.
- Advisors.
- Instructors.
- Workers.
- Other factory services.

**B. Structured message delivery**

Every important event should contain:

- `eventId`
- Timestamp.
- `correlationId`
- `jobId`
- Source actor.
- Destination actor.
- Floor ID.
- Event type.
- Severity.
- Payload.
- Signature or integrity evidence where required.

**C. Factory observability**

Comms should maintain the relationship between:

- Mission events.
- Worker execution events.
- Failure events.
- Recovery events.
- Verification events.
- Treasury events.
- Governance decisions.

**D. Cross-floor coordination**

Support structured communication between different floors without allowing arbitrary cross-floor command execution.

## 8.3 Standard event examples

- `JOB_PLANNED`
- `FLOOR_PIPELINE_STARTED`
- `WORKER_ACTION_AUTHORIZED`
- `WORKER_EXECUTION_SUCCESS`
- `WORKER_EXECUTION_FAILED`
- `PHYSICAL_VALIDATION_FAILED`
- `SEMANTIC_VALIDATION_FAILED`
- `CIRCUIT_BREAKER_TRIGGERED`
- `SLAYER_INCIDENT_CLASSIFIED`
- `HEALER_HOTFIX_APPLIED`
- `REMAKER_REPAIR_SUBMITTED`
- `XP_LEDGER_MUTATED`
- `FLOOR_EXECUTION_COMPLETED`

## 8.4 Important separation

Comms transports information.

It does not independently decide what the factory should do.

It is not:

- The global commander.
- The capability authorizer.
- The financial authority.
- The repair executor.
- The final verification authority.

Communication does not grant permission.

## 8.5 Success criteria

- Reliable event delivery.
- Traceable event history.
- Correct event correlation.
- No unauthorized command propagation.
- No silent event loss.
- Clear incident communication.
- Consistent cross-floor state visibility.

**Fundamental rule: COMMS CONNECTS THE FACTORY WITHOUT BECOMING ITS COMMANDER.**

---

# AGENT 07 — GUARDIAN

**Primary Identity:** Sovereign Floor Controller  
**Authority Type:** Local operational command and authorization  
**Operating Scope:** One governed production floor

## 9.1 What is Guardian?

Guardian is the highest operational authority inside its particular floor.

Each governed floor receives its own Guardian.

For example:

- Floor 00 Guardian.
- Floor 01 Guardian.
- Floor 02 Guardian.
- Floor 03 Guardian.
- Floor 04 Guardian.
- Floor 05 Guardian.
- Floor 06 Guardian.
- Floor 07 Guardian.

The canonical floor registry must determine the actual active floor set.

Guardian is responsible for ensuring that production within its floor follows approved rules, uses authorized capabilities and produces valid deliverables.

## 9.2 Primary responsibilities

**A. Floor governance**

- Own floor-level operating policy.
- Maintain floor permissions.
- Interpret floor requirements.
- Supervise floor execution.
- Maintain floor operational state.
- Enforce capability boundaries.

**B. Worker authorization**

Before a worker performs a protected operation, Guardian evaluates the requested action.

It must establish:

- Is the worker authorized?
- Is the capability permitted?
- Are the input requirements satisfied?
- Is the execution scope valid?
- Are the required resources available?
- Are the relevant policies satisfied?

**C. Worker management**

- Dispatch authorized tasks.
- Supervise execution.
- Observe worker reports.
- Evaluate worker results.
- Handle local execution problems.
- Prevent unauthorized operations.

**D. Artifact validation**

Guardian's contract includes:

- Evaluating proposals.
- Authorizing worker capabilities.
- Physical and domain-level validation.
- Committing or rolling back state transitions.

**E. Ministerial coordination**

Guardian receives guidance from:

- Advisor.
- Instructor.
- Auditor.
- Ascalon.
- Other relevant floor systems.

Guardian evaluates recommendations and makes the final floor-level operational decision.

## 9.3 The fundamental command path

OVERSEER  
↓  
FLOOR GUARDIAN  
↓  
PRODUCTION WORKER  
↓  
EXECUTION  
↓  
GUARDIAN VALIDATION  
↓  
HANDOFF

Overseer does not need to micromanage every individual worker.

Guardian is responsible for managing its local production workforce.

## 9.4 Authority boundaries

Guardian is sovereign within its floor, but not above the global factory authority.

It cannot:

- Override human-level policy.
- Override Overseer's global mission decisions.
- Grant unrestricted cross-floor authority.
- Bypass Treasurer's resource constraints.
- Replace independent audit.
- Claim F07 verification without evidence.

## 9.5 Success criteria

- Correct capability authorization.
- Policy compliance.
- Worker reliability.
- Valid state transitions.
- Controlled incident recovery.
- Complete floor reports.
- Correct cross-floor handoffs.

**Fundamental rule: GUARDIAN COMMANDS ITS FLOOR AND PROTECTS ITS AUTHORITY BOUNDARIES.**

---

# AGENT 08 — AUDITOR

**Primary Identity:** Independent Examination and Integrity Authority  
**Authority Type:** Independent verification and governance inspection  
**Operating Scope:** Individual floor and associated factory audit processes

## 10.1 What is Auditor?

Auditor is the independent examiner of ShortForge.

Its purpose is to determine whether work has genuinely satisfied its requirements.

Auditor must not simply trust the claims made by workers, Guardians, Healers, ReMaker or boundary systems.

It independently evaluates the evidence.

The Auditor should be capable of challenging even the decisions and execution records produced by the Guardian.

## 10.2 Primary responsibilities

**A. Execution auditing**

Check:

- Whether workers followed the authorized task.
- Whether execution matched the assigned capability.
- Whether workers exceeded their scope.
- Whether contracts were respected.
- Whether policy violations occurred.

**B. Evidence inspection**

Check:

- Input and output evidence.
- Artifact integrity.
- Content provenance.
- Execution receipts.
- Lineage records.
- Validation results.
- Incident fingerprints.
- Recovery evidence.

**C. Incident auditing**

Verify:

- Whether an incident actually occurred.
- Whether the reported root cause is supported.
- Whether worker fault was correctly attributed.
- Whether the incident affected other components.
- Whether the proposed XP penalty or reward is justified.

**D. Recovery auditing**

When Healer reports that an issue is resolved, Auditor independently examines:

- Whether the repair actually happened.
- Whether the affected component is valid.
- Whether unrelated content was preserved.
- Whether the recovery followed authorization.
- Whether the evidence supports closure.

**E. Governance auditing**

Auditor produces:

- Integrity findings.
- Compliance findings.
- Evidence gaps.
- Non-compliance reports.
- Verification results.
- Rejection reasons.
- Recommendations for corrective action.

## 10.3 Independent authority

A particularly important rule:

Auditor must not become subordinate to a system it is inspecting.

For example:

BDA reports a problem.  
Auditor examines the evidence.

Healer reports a repair.  
Auditor verifies the repair.

Worker reports success.  
Auditor checks the output.

Guardian reports compliance.  
Auditor independently examines the supporting record.

## 10.4 Auditor versus F07

These must not be confused.

Auditor is the independent examination role within the governance architecture.

F07 is the specialized release-integrity and verification boundary.

The Auditor's finding cannot replace F07's required physical-artifact verification and release evidence.

## 10.5 Success criteria

- Independent findings.
- Correct evidence attribution.
- Detection of false success claims.
- Identification of policy violations.
- Accurate verification.
- Complete audit history.
- No self-certification.

**Fundamental rule: AUDITOR VERIFIES WHAT ACTUALLY HAPPENED, NOT WHAT SOMEONE CLAIMS HAPPENED.**

---

# AGENT 09 — ADVISOR

**Primary Identity:** Strategic Counsel / Optimization Specialist  
**Authority Type:** Recommendation and decision support  
**Operating Scope:** Individual floor

## 11.1 What is Advisor?

Advisor is the strategic counsel of each floor.

It evaluates the current operating environment and recommends the most suitable course of action.

Advisor helps Guardian make better decisions.

It does not replace Guardian authority.

## 11.2 Primary responsibilities

**A. Operational analysis**

Advisor studies:

- Current floor conditions.
- Available resources.
- Provider health.
- Historical execution outcomes.
- Worker performance.
- Operational efficiency.
- Resource requirements.
- Execution risks.

**B. Strategy development**

Advisor develops alternative strategies for the current objective.

Examples:

- Select a more reliable provider.
- Use a cheaper execution route.
- Change task sequencing.
- Avoid unnecessary regeneration.
- Optimize model selection.
- Reduce execution dependencies.
- Suggest parallel processing.
- Recommend a different recovery approach.

**C. Performance optimization**

Advisor studies historical outcomes to identify improvements.

It can evaluate:

- Execution time.
- Cost.
- Quality.
- Failure frequency.
- Resource consumption.
- Retry patterns.
- Provider reliability.

**D. Decision support**

Advisor prepares structured recommendations for Guardian.

A recommendation should include:

- Proposed action.
- Supporting evidence.
- Expected benefits.
- Estimated cost.
- Risks.
- Alternative strategies.
- Expected outcome.
- Uncertainty.
- Conditions under which the recommendation should be rejected.

## 11.3 Example

A floor needs to generate visual assets.

Current provider: Provider A.

Advisor discovers:

- Provider A is experiencing high latency.
- Provider B has better availability.
- Provider B satisfies the required capability.
- Provider B has a lower justified cost.

Advisor recommends switching to Provider B.

Guardian evaluates the recommendation and authorizes the operation.

Treasurer independently evaluates resource expenditure.

## 11.4 Authority boundaries

Advisor:

- Recommends.
- Analyzes.
- Compares.
- Evaluates.
- Optimizes.

Advisor does not:

- Command workers.
- Authorize capabilities.
- Spend resources.
- Override Guardian policy.
- Modify production state without approval.

## 11.5 Success criteria

- Recommendation accuracy.
- Improved execution efficiency.
- Reduced unnecessary expenditure.
- Better provider selection.
- Lower failure rates.
- Evidence-backed suggestions.
- Measurable operational improvement.

**Fundamental rule: ADVISOR RECOMMENDS THE BEST APPROACH; GUARDIAN AUTHORIZES IT.**

---

# AGENT 10 — INSTRUCTOR

**Primary Identity:** Knowledge Minister / Procedural Authority  
**Authority Type:** Knowledge, operational instruction and learning governance  
**Operating Scope:** Individual floor

## 12.1 What is Instructor?

Instructor is the knowledge and procedural learning authority of each floor.

It ensures that the floor knows how it is supposed to operate.

Instructor converts operational experience, verified outcomes, technical knowledge and approved procedures into structured knowledge.

It is particularly important for the long-term development of Ascalon and the continuous improvement of floor intelligence.

## 12.2 Primary responsibilities

**A. Floor knowledge management**

- Maintain floor-specific knowledge.
- Understand operational responsibilities.
- Document execution methods.
- Explain expected production standards.
- Maintain approved procedural guidance.
- Identify knowledge gaps.

**B. Failure learning**

Instructor studies recurring failures.

It identifies:

- Repeated worker mistakes.
- Incorrect execution patterns.
- Common input problems.
- Ineffective repair procedures.
- Poor-performing strategies.
- Knowledge gaps.

**C. Training development**

- Prepare training material.
- Develop evaluation scenarios.
- Create failure examples.
- Explain successful approaches.
- Explain unsuccessful approaches.
- Produce procedural lessons.
- Improve floor-specific learning material.

**D. Ascalon knowledge preparation**

Instructor prepares structured knowledge for the Guardian's cognitive layer.

The relationship:

Factory Experience  
↓  
Verified Evidence  
↓  
Instructor  
↓  
Lessons / Knowledge / Training Material  
↓  
Ascalon  
↓  
Guardian Decision Support

## 12.3 Procedural authority

Instructor defines how the floor should perform its responsibilities within approved policy.

It can publish or update floor-level operating guidance through the governed knowledge-management process.

However, Instructor cannot independently change global security policy or grant itself operational authority.

## 12.4 Example

Floor 04 repeatedly experiences failures during media synthesis.

Instructor investigates historical incidents and identifies:

- Incorrect input specification.
- Repeated parameter mismatch.
- Poor provider-specific handling.
- Missing procedural validation.

It develops a lesson and updated operating procedure.

The knowledge is incorporated into the relevant evaluation and training process.

The next execution can use the updated procedural knowledge.

## 12.5 Success criteria

- Improved floor knowledge.
- Reduced repeated mistakes.
- Better training material.
- Higher procedural consistency.
- Improved Ascalon knowledge.
- Accurate distinction between verified facts and hypotheses.
- Version-controlled instructions.

**Fundamental rule: INSTRUCTOR TEACHES THE FLOOR HOW TO OPERATE CORRECTLY.**

---

# 4. Inter-Agent Cooperation Architecture

The ten roles must not function as isolated entities.

Their responsibilities are deliberately interconnected.

## 4.1 Normal production workflow

HUMAN CO-LEADS  
↓  
OVERSEER  
↓  
MISSION PLANNING  
↓  
FLOOR GUARDIAN  
↓  
ADVISOR + INSTRUCTOR + ASCALON  
↓  
AUTHORIZED WORKERS  
↓  
EXECUTION  
↓  
AUDITOR / VALIDATION  
↓  
NEXT FLOOR  
↓  
F07 VERIFICATION  
↓  
OVERSEER  
↓  
HUMAN-READABLE RESULT

Treasurer provides the required economic authorization and resource reservations wherever resource expenditure is involved.

Comms transports the relevant events and execution records throughout the workflow.

## 4.2 Failure and recovery workflow

WORKER FAILURE  
↓  
COMMS  
↓  
SLAYER INVESTIGATION  
↓  
INCIDENT CLASSIFICATION  
↓  
OVERSEER  
↓  
RECOVERY DECISION  
↓  
HEALER  
↓  
RECOVERABLE?

If normal recovery is successful:

HEALER  
↓  
VALIDATION  
↓  
AUDITOR  
↓  
GUARDIAN  
↓  
RESUME EXECUTION

If structural reconstruction is needed:

HEALER / OVERSEER  
↓  
GUARDIAN AUTHORIZATION  
↓  
REMAKER  
↓  
SURGICAL RECONSTRUCTION  
↓  
RENDERFABRIC  
↓  
NEW ARTIFACT  
↓  
CAS  
↓  
F07  
↓  
AUDIT / VALIDATION  
↓  
GUARDIAN / OVERSEER

A repair must never be accepted merely because the agent reports success.

## 4.3 Financial governance workflow

WORKER NEEDS RESOURCE  
↓  
OVERSEER REQUEST  
↓  
TREASURER  
↓  
QUOTE  
↓  
CHECK  
↓  
RESERVE  
↓  
GUARDIAN CAPABILITY AUTHORIZATION  
↓  
COMPUTEROUTER  
↓  
WORKER EXECUTION  
↓  
F07 VERIFICATION  
↓  
TREASURY SETTLEMENT / RELEASE

The Treasurer and Guardian remain independent control gates.

---

# 5. Authority and Permission Matrix

| Operation | Responsible authority |
|---|---|
| Global strategy | Human Co-Leads |
| Mission planning | Overseer |
| Mission coordination | Overseer |
| Floor command | Guardian |
| Worker dispatch | Guardian |
| Capability authorization | Guardian |
| Resource allocation | Treasurer |
| XP ledger updates | Treasurer, after authorization |
| Incident investigation | Slayer |
| Emergency containment | Slayer, within granted capability |
| Recovery execution | Healer |
| Structural reconstruction | ReMaker |
| Event delivery | Comms |
| Independent inspection | Auditor |
| Strategic recommendations | Advisor |
| Procedural knowledge | Instructor |
| Physical rendering | RenderFabric / Compute Fabric |
| Final release verification | F07 |
| Human-only high-impact approval | Human Co-Leads |

No agent should be able to grant itself new authority.

Every privileged action must have a valid authorization, explicit scope and traceable result.

---

# 6. Cross-Cutting Governance Rules

These rules apply to all ten roles.

## 6.1 Least privilege

Every role receives only the permissions necessary to fulfil its responsibility.

## 6.2 Traceability

Important decisions and operations must be associated with:

- Agent identity.
- Role.
- Mission ID.
- Floor ID.
- Execution ID.
- Correlation ID.
- Authorization evidence.
- Input/output evidence.
- Timestamp.
- Result.

## 6.3 Immutable history

Historical events and financial transactions must not be silently overwritten.

Corrections should create new records.

## 6.4 Bounded autonomy

No agent should be able to expand its operational scope without explicit authorization.

## 6.5 Independent verification

Execution success is not equivalent to verified success.

The correct evidence must establish that the requested result was actually produced.

## 6.6 Safe recovery

Recovery procedures must have:

- Bounded retries.
- Timeouts.
- Idempotency.
- Fencing.
- Scope restrictions.
- Resource controls.
- Escalation conditions.

## 6.7 Human supremacy

No agent may override the human Co-Leads' global policies, security restrictions or emergency authority.

---

# 7. Additional Architecture Components — Not to Be Confused With the Ten Roles

Several additional components appear in the later ShortForge Floor Governance design.

They are important, but they should not be silently counted as replacements for the ten core roles.

## 7.1 Ascalon — Guardian Cognitive Layer

Ascalon is the cognitive layer or brain supporting a Floor Guardian.

It handles:

- Perception.
- Reasoning.
- Diagnosis.
- Planning.
- Prediction.
- Optimization.
- Memory and context.
- Decision support.

The fundamental distinction:

**Ascalon thinks for the Guardian. It does not replace Guardian authority.**

## 7.2 BDA — Border Defence Agent

BDA was introduced as a separate boundary-control subsystem.

Its responsibility is to govern everything entering or leaving an individual floor.

It handles:

- Ingress inspection.
- Egress inspection.
- Input/output contract checks.
- Identity and capability checks.
- IR documentation.
- Provenance recording.
- Integrity checks.
- Evidence dossiers.
- Quarantine.
- Incident creation.

BDA submits its inspection records to Auditor.

Auditor independently evaluates the evidence.

Guardian retains the floor's final operational authority.

**BDA records and protects the boundary. Auditor examines. Guardian decides.**

## 7.3 FG-Healer — Floor-Specific Healer

The global Healer and a floor-specific FG-Healer serve different levels.

FG-Healer understands the anomalies specific to its floor.

The proposed joint recovery model is:

FLOOR INCIDENT  
↓  
GUARDIAN  
↓  
FG-HEALER  
↓  
OVERSEER REQUESTS GLOBAL ASSISTANCE  
↓  
COMMON HEALER  
↓  
JOINT HEALING SESSION  
↓  
RECOVERY  
↓  
BDA REINSPECTION  
↓  
AUDITOR  
↓  
GUARDIAN CLOSES INCIDENT

This allows floor-level expertise and factory-wide recovery expertise to cooperate.

## 7.4 F07 — Release Integrity Guardian

F07 is the independent release-integrity boundary.

It is responsible for verifying the physical output and relevant release conditions.

Its verification cannot be replaced by an Auditor report, worker success message or ReMaker completion message.

---

# 8. Required Agent Reporting Standards

Every governance agent should return structured reports rather than relying only on ordinary conversational messages.

| Agent | Required output |
|---|---|
| Overseer | Mission and orchestration report |
| Treasurer | Resource and treasury transaction report |
| Slayer | Incident and root-cause report |
| Healer | Recovery and restoration report |
| ReMaker | Reconstruction and preservation report |
| Comms | Event delivery and correlation record |
| Guardian | Floor authorization and execution report |
| Auditor | Independent audit report |
| Advisor | Strategic recommendation report |
| Instructor | Knowledge and learning report |

All reports should include appropriate evidence references and provenance.

---

# 9. Final Governance Principles

The following principles define the intended ShortForge authority model.

1. Human Co-Leads own the factory.
2. Overseer commands and coordinates the factory.
3. Treasurer protects and allocates economic resources.
4. Slayer investigates and classifies incidents.
5. Healer restores failed operations.
6. ReMaker performs authorized structural reconstruction.
7. Comms connects factory components through structured events.
8. Guardian controls its respective floor.
9. Auditor independently examines the evidence.
10. Advisor recommends the best strategic approach.
11. Instructor maintains procedural knowledge and learning.
12. Ascalon supports Guardian cognition without replacing Guardian authority.
13. BDA protects floor boundaries without replacing Auditor or Guardian.
14. F07 independently establishes release integrity.
15. Production workers execute only bounded and authorized operations.

---

# 10. Closing Statement

ShortForge should operate as a governed autonomous factory, not as an uncontrolled collection of AI agents.

The strength of this architecture comes from the separation of authority and responsibility.

Overseer provides direction.

Treasurer protects resources.

Slayer identifies failures.

Healer restores operations.

ReMaker reconstructs defective work.

Comms connects the system.

Guardian controls each production floor.

Auditor establishes independent accountability.

Advisor improves decisions.

Instructor develops knowledge.

Together, these roles create an accountable, observable, recoverable and economically controlled AI production environment.

**SHORTFORGE GOVERNANCE PHILOSOPHY**

*Every agent has a defined responsibility. Every authority has a boundary. Every important action has evidence. Every failure has an accountable recovery path. No agent is above the human Co-Leads.*

**END OF ROLE CHARTER**
