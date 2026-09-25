
# ShortForge / FactoryOS — Worker Permissions & Capability Matrix

> Document Class: Canonical Worker Security Contract
> Status: OPERATIONAL / CANONICAL
> Source Basis: .okf/security/capability-security.md, .okf/intelligence/skills.md, .okf/hierarchy/worker.md, .okf/principles.md, executable AgentRuntime / CapabilityRegistry contracts
> Purpose: Define exactly what production workers may do, what they may never do, how permissions are granted, attenuated, verified, revoked, and audited.

## 1. Absolute worker security rule

Workers have no ambient authority.

A worker may execute only when all of the following are true:

1. Its identity is known.
2. Its floor is known.
3. Its WorkerTaskContract is valid.
4. Its session has the required capability grants.
5. The requested skill matches the granted capabilities.
6. Guardian / policy authorization succeeds where required.
7. The worker holds a valid lease and fencing token where the operation is lease-bound.
8. The operation remains inside the worker's floor boundary.
9. Input and output schemas validate.
10. The result remains subject to downstream verification.

Prompt instructions never substitute for capability enforcement.

## 2. Permission enforcement chain

~~~
WorkerTaskContract
      |
      v
Identity / Floor Resolution
      |
      v
Capability Grant Check
      |
      v
Skill Required-Capability Check
      |
      v
Guardian / Policy Gate
      |
      v
Lease + Fencing Validation
      |
      v
AgentRuntime Execution
      |
      v
Structured Result
      |
      v
Verification / Artifact Gate
~~~

Any failed authorization is fail-closed.

## 3. Canonical capability principle

Capability attenuation is mandatory:

~~~
childCapabilities ⊆ parentCapabilities
~~~

A parent cannot grant a capability it does not possess.

Privilege escalation causes:

- SECURITY_VIOLATION
- session / task rejection
- event emission
- Slayer visibility
- forensic record where applicable

## 4. Current canonical capability vocabulary

The current documented production capability set includes:

- CAP_NET_READ
- CAP_RESEARCH_EXEC
- CAP_FS_WRITE
- CAP_RENDER_DISPATCH
- CAP_DELIVERY_PUBLISH
- CAP_STRATEGY_SYNTHESIS
- CAP_SCRIPT_WRITING
- CAP_AUDIO_ENCODE
- CAP_ASSET_INGEST
- CAP_VECTOR_SEARCH
- CAP_VOICE_SYNTHESIS
- CAP_TIMELINE_COMPILE
- CAP_QA_INSPECT
- CAP_EVAL_EXEC

The exact executable registry remains authoritative if the implementation diverges from documentation.

## 5. Canonical floor permission matrix

| Floor | Default capabilities | Strictly forbidden capabilities |
|---|---|---|
| F00 Analyst | CAP_NET_READ, CAP_RESEARCH_EXEC | CAP_FS_WRITE, CAP_RENDER_DISPATCH, CAP_DELIVERY_PUBLISH |
| F01 Strategy | CAP_STRATEGY_SYNTHESIS | CAP_NET_READ, CAP_FS_WRITE, CAP_RENDER_DISPATCH |
| F02 Scripting | CAP_SCRIPT_WRITING | CAP_NET_READ, CAP_AUDIO_ENCODE, CAP_RENDER_DISPATCH |
| F03 Asset Realization | CAP_ASSET_INGEST, CAP_VECTOR_SEARCH | CAP_SCRIPT_WRITING, CAP_DELIVERY_PUBLISH |
| F04 Media Synthesis | CAP_VOICE_SYNTHESIS, CAP_AUDIO_ENCODE | CAP_NET_WRITE, CAP_TIMELINE_COMPILE |
| F05 Timeline Composition | CAP_TIMELINE_COMPILE | CAP_NET_READ, CAP_RENDER_DISPATCH |
| F06 Rendering | CAP_RENDER_DISPATCH, CAP_FS_WRITE | CAP_NET_WRITE, CAP_SCRIPT_WRITING |
| F07 QA / Compliance | CAP_QA_INSPECT, CAP_EVAL_EXEC | CAP_FS_WRITE, CAP_DELIVERY_PUBLISH |

## 6. Why the matrix is intentionally restrictive

The matrix prevents capability collapse.

Examples:

- F02 cannot browse arbitrarily just because the model requests more context.
- F03 cannot rewrite scripting decisions.
- F04 cannot compile timelines.
- F05 cannot dispatch GPU rendering directly.
- F06 cannot rewrite scripts.
- F07 cannot publish artifacts.
- No floor worker receives publication authority by default.

## 7. Network permissions

Network access is split into capability classes.

### CAP_NET_READ

Allows only approved read-side retrieval paths subject to:

- URL validation
- SSRF defense
- provider policy
- timeout
- response-size limits
- provenance recording

It does not grant network write access.

### Network write

Network write is intentionally not part of the standard floor-worker grants.

Any future write capability must be:

- separately named
- separately registered
- parameter constrained
- explicitly authorized
- audited
- independently tested

## 8. Filesystem permissions

CAP_FS_WRITE does not mean unrestricted filesystem write.

The intended target policy is:

~~~
CAP_FS_WRITE
  |
  +-- approved scratch root
  +-- approved artifact staging path
  +-- explicit output targets
  +-- no credential directories
  +-- no arbitrary parent traversal
  +-- no global configuration mutation
~~~

All paths must be normalized and containment-checked.

Workers must not read or write secrets merely because they have a filesystem capability.

## 9. Render permissions

CAP_RENDER_DISPATCH means:

- submit an authorized RenderIntent / RenderJob
- target an allowed compute capability
- obey quota
- obey lease and fencing rules
- record job identity
- wait for authoritative callback / state transition

It does not mean:

- mark job complete
- bypass F07
- fabricate an artifact
- bypass render state machine
- directly change quota state
- declare publication success

## 10. Publication permissions

CAP_DELIVERY_PUBLISH is outside the default production-floor worker grants.

Publishing requires:

~~~
Verified artifact
  |
Verification Receipt
  |
Delivery eligibility
  |
Idempotency key
  |
Sandboxed delivery worker
  |
External platform receipt
~~~

General production workers must never possess channel credentials by default.

## 11. Skill-level permission contract

Every Skill must declare:

- skill ID
- required capabilities
- input schema
- output schema
- timeout
- execution context
- cancellation behavior
- idempotency class
- artifact / evidence effect

AgentRuntime checks the required capabilities before Skill execution.

Invalid input must be rejected before downstream side effects.

## 12. WorkerTaskContract permission fields

Every worker task must carry:

~~~
workerId
floorId
specialization
objective
inputs
constraints
allowedCapabilities
toolBudget
successCriteria
verificationCriteria
escalationPolicy
memoryRefs
~~~

The worker cannot expand this set autonomously.

## 13. Lease and fencing requirements

Any side-effecting distributed worker operation must respect:

- active lease
- monotonically increasing fencing token
- current attempt identity
- task / mission identity
- callback authentication
- duplicate callback rejection

Expired or stale workers cannot successfully commit.

## 14. Permission lifecycle

~~~
REQUEST
  |
ASSESS
  |
GRANT
  |
ATTENUATE
  |
EXECUTE
  |
OBSERVE
  |
VERIFY
  |
REVOKE / EXPIRE
~~~

Permissions are short-lived operational authority, not permanent worker identity.

## 15. Cognitive Layer relationship

SCL may recommend:

- worker selection
- capability requirements
- skill selection
- provider selection
- repair action
- escalation

SCL does not grant itself capabilities.

Guardian / policy infrastructure authorizes capability use.

## 16. Slayer relationship

Slayer owns emergency enforcement:

- lease revocation
- stale worker eviction
- circuit isolation
- emergency kill paths

SCL may classify or recommend.

SCL does not perform the revocation.

## 17. Healer relationship

Healer can receive a bounded repair assignment.

Healer cannot:

- grant arbitrary worker permissions
- expand a worker's floor scope
- bypass Guardian
- ignore fencing
- declare final success

## 18. F07 / Auditor relationship

Workers produce results.

F07 / Auditor produces independent evidence.

A worker cannot certify its own output as final truth.

## 19. Production-helper relationship

Production-helper is a verification / engineering utility layer, not a privilege escalation mechanism.

A production-helper procedure may inspect or validate a worker, but it must not grant that worker capabilities merely to make a test pass.

## 20. Permission tests required for every new capability

Every new worker capability must add tests for:

1. allowed floor
2. denied floor
3. allowed role
4. denied role
5. missing capability
6. privilege escalation
7. malformed input
8. stale lease / fencing
9. replay / duplicate request
10. production environment restrictions
11. unverified / prototype provider restrictions where applicable
12. audit record emission

## 21. Status discipline

This document defines the canonical permission model.

It does not claim that every future capability or parameter-level constraint is already implemented.

Implementation status must be verified against:

1. executable registry
2. contracts
3. tests
4. runtime configuration
5. this .okf document

## 22. Absolute worker rules

1. Least privilege by default.
2. No ambient authority.
3. No self-granting.
4. No capability escalation.
5. No cross-floor mutation without explicit authorized delegation.
6. No stale-lease writes.
7. No publishing from ordinary production workers.
8. No physical success claims without verification.
9. No secrets in worker working memory unless explicitly required and sandboxed.
10. No permission added solely because an LLM requested it.

## 23. Absolute permission authority

This file is the single canonical worker-permission map. Do not create a second worker-permissions source elsewhere in .okf.

Permission authority is layered:

~~~
Human / policy authority
        |
        v
Overseer task authority
        |
        v
Guardian capability authorization
        |
        v
AgentRuntime capability enforcement
        |
        v
Worker execution
        |
        v
F07 / Auditor verification
~~~

SCL may recommend a capability or task route. SCL does not grant capability authority.

## 24. Absolute per-floor permission posture

The floor matrix is a deny-by-default baseline, not a request for every worker to receive every capability.

### F00 Analyst
Allowed baseline: research read, research execution, evidence ingestion.
Forbidden baseline: render dispatch, publication, arbitrary filesystem mutation.

### F01 Strategy
Allowed baseline: strategy synthesis, bounded context retrieval through approved interfaces.
Forbidden baseline: rendering, publication, arbitrary network write.

### F02 Scripting
Allowed baseline: script writing, structured context consumption, verified-claim lookup.
Forbidden baseline: rendering, audio synthesis, arbitrary network access.

### F03 Asset Realization
Allowed baseline: asset ingest, approved retrieval/vector lookup, visual-plan execution.
Forbidden baseline: script authority, publication.

### F04 Media Synthesis
Allowed baseline: voice synthesis, audio encoding, approved provider execution.
Forbidden baseline: timeline compilation, publication.

### F05 Timeline
Allowed baseline: TimelineIR compilation and composition validation.
Forbidden baseline: direct GPU dispatch, arbitrary network access.

### F06 Rendering
Allowed baseline: authorized RenderIntent / RenderJob dispatch, approved artifact staging.
Forbidden baseline: script rewriting, publication authority, quota mutation.

### F07 Verification
Allowed baseline: read-only inspection, evaluation, evidence collection, findings.
Forbidden baseline: artifact mutation, publication, self-certification.

These are governance defaults. Executable CapabilityRegistry and contracts remain authoritative where a documented capability set diverges.

## 25. Cognitive permissions

The ShortForge Cognitive Layer is not automatically privileged because it is intelligent.

SCL may:
- construct WorkerTaskContracts
- recommend already-authorized capabilities
- rank eligible workers/providers/templates
- request diagnostics
- propose repairs
- prepare architecture proposals

SCL may not:
- mint capabilities
- bypass Guardian
- extend lease authority
- revoke a lease directly
- publish artifacts
- certify final verification
- turn research into policy without validation

## 26. Permission change procedure

Any new worker capability follows:

1. define the capability
2. define allowed roles
3. define allowed floors
4. define environments
5. define input/output schema
6. define side effects
7. define lease/fencing requirements
8. define denial conditions
9. add positive and negative tests
10. run applicable production-helper security checks
11. verify with Guardian policy
12. record the decision in .okf/decisions.md
13. only then promote to implementation

A permission request originating from an LLM, worker, external repository, or test fixture is not evidence that the permission should exist.

## 27. Production-helper permission routine

For permission changes, the routine validation station is production-helper/.

Minimum expected checks:
- targeted capability tests
- privilege-escalation tests
- stale-lease / fencing tests
- replay / duplicate-request tests
- Semgrep for security-sensitive code
- Strix when Docker is available
- staging proof for production-bound side effects

A blocked Strix run remains UNPROVEN, never PASS.


## 28. MCP access is separate from floor permissions

MCP access is not ambient worker authority.

No F00-F07 worker receives MCP capabilities by default. If a worker must use an MCP, the access must be represented as an explicit capability and skill contract, with task/session scope and verification requirements.

Canonical MCP capabilities are documented separately in .okf/security/mcp-permissions.md:
- CAP_MCP_DRIVE_READ
- CAP_MCP_DRIVE_WRITE
- CAP_MCP_BROWSER_RESEARCH
- CAP_MCP_GITHUB_READ
- CAP_MCP_GITHUB_WRITE

These names are governance reservations until the executable CapabilityRegistry, tests, and production-helper checks establish them as implemented capabilities.

An MCP call can retrieve information or request an external side effect, but it cannot:
- mint capabilities
- extend/revoke leases
- bypass Guardian
- certify F07
- mint ReleaseAuthorization
- convert provider success into verified production completion
