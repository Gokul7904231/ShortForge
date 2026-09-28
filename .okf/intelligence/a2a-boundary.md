# ShortForge / FactoryOS — A2A Boundary

## Status

DESIGN BOUNDARY / NOT YET A LIVE A2A ENDPOINT

## 1. Role

A2A is the horizontal interoperability layer between independent agents. It is not the local tool execution layer and it is not a source of ShortForge authority.

Current A2A 1.0 concepts map naturally to ShortForge as:

- Agent Card -> externally visible capability/discovery metadata
- Task -> remote collaborative work item
- Message -> interaction/clarification/status
- Artifact -> returned remote result or file reference

## 2. Boundary

```text
Remote Agent
    |
    | A2A Task / Message / Artifact
    v
ShortForge A2A adapter
    |
    v
proposal / evidence / remote-result boundary
    |
    v
AEF + FGC
    |
    v
local authorized execution
```

Remote agents do not inherit:
- ShortForge worker capabilities
- Guardian authority
- leases or fencing tokens
- internal memory
- ReleaseAuthorization
- F07 verification authority

## 3. Async model

Remote A2A work should enter ShortForge as a durable task/reference, not as a blocking worker thread. Task completion, timeout, cancellation and human approval remain explicit structured state.

## 4. Security

Agent Cards describe capabilities but do not grant local execution permission. Remote task payloads are untrusted inputs until validated against local schemas, provenance rules, AEF step contracts and FGC authority.

## 5. Implementation boundary

Do not add a second autonomous orchestration engine merely to implement A2A. Reuse AgentRuntime, AEF, DurableEventBus, existing mission/task persistence, FGC and F07.

Live A2A transport, authentication, discovery and remote-agent trust are future implementation work and are not claimed by this document.