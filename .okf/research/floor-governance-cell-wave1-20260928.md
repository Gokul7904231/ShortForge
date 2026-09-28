# Floor Governance Cell — Research & Adoption Ledger (2026-09-28)

## Research question

How should one ShortForge production floor become a high-capability agentic control cell without collapsing cognition, authority, execution, repair and verification into one model?

## Adopted findings

### 1. Indirect prompt injection is an execution-boundary problem
NetInjectBench (2026) studies network-operation agents exposed to tickets, alerts, logs, runbooks and ChatOps messages carrying indirect prompt injections. The result supports separating untrusted artifact text from trusted policy metadata and enforcing authorization at execution time.
ShortForge adoption: BDA / blackboard evidence is data. It is never executable instruction by itself.
Source: https://arxiv.org/abs/2607.10490

### 2. Authorization should be a separate typed decision
Cedar models authorization around principal, action, resource and context, with policy evaluation returning allow/deny.
ShortForge adoption: FloorActionDefinition + FloorActionProposal + GuardianAuthorization.
Source: https://docs.cedarpolicy.com/auth/authorization.html

### 3. Provenance should describe authorized steps and produced evidence
in-toto defines layouts containing authorized steps and functionaries, then records signed link metadata so the resulting chain can be verified.
ShortForge adoption: BorderDossier and action receipts should bind actor, action, input/output digests and authorization.
Source: https://in-toto.io/docs/getting-started/

### 4. Workload identity should be cryptographic and short-lived
SPIFFE/SPIRE provides workload identities through SVIDs and supports short-lived credentials and automated rotation.
ShortForge adoption: future floor/role/resource identities should be first-class runtime inputs.
Source: https://spiffe.io/docs/latest/deploying/svids/

### 5. Agent observability needs model/tool relationships
OpenTelemetry's 2026 GenAI observability guidance standardizes model calls, tool invocations, token metrics and related traces.
ShortForge adoption: extend TraceContext with floor, action proposal, authorization, incident, healing session, repair action and verification identifiers.
Source: https://opentelemetry.io/blog/2026/genai-observability/

### 6. Long-running agent state belongs in durable workflows
Temporal's current agent guidance emphasizes durable execution, long-lived state and human intervention across distributed AI workflows.
ShortForge adoption: future JointHealingSession must checkpoint and resume without losing incident or mutation history.
Source: https://temporal.io/ai/agentic-ai

### 7. Lineage should keep producer identity explicit
OpenLineage exposes producer metadata so downstream consumers can understand where metadata came from.
ShortForge adoption: BorderDossier and evidence records retain explicit producer/consumer identity.
Source: https://openlineage.io/docs/spec/producers/

## Deferred

- Generic autonomous multi-agent conversation as the internal authority mechanism.
- LLM-generated arbitrary tool names.
- Model confidence as evidence.
- Incident-wide locking instead of resource-level mutation fencing.
- MCP or A2A as the internal sovereign authority system.
- Simulation output being treated as production truth.

## Clean-room rule

External research informs architecture; it never overrides executable implementation, canonical contracts/ontologies, automated tests, runtime configuration, or .okf authority.

## Promotion requirement

No target architecture in this ledger may be described as fully implemented until code and regression tests demonstrate the capability.