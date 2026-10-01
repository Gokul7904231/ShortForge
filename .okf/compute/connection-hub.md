# ShortForge Compute Connection Hub

Status: V1 implementation

## Product boundary

- Basic users may connect notebook providers and use local rendering.
- Admins may see Notebook, Sandbox, and API/GPU provider families.
- Self-hosted sandbox connections are intentionally out of scope because Local Rendering already covers user-owned machines.
- Provider credentials never belong to Ascalon, workers, MCP prompts, or client-side state after submission.

## Architecture

```
User / Agent
    |
    +-- Web UI
    +-- REST/SDK
    +-- MCP
    |
    v
Compute Access Layer
    |
    +-- Authentication / RBAC
    +-- Connection Hub
    |      |
    |      +-- provider definition
    |      +-- encrypted secret bundle
    |      +-- connection status
    |      +-- capability snapshot
    |
    v
ComputeRouter / NotebookRouter
    |
    +-- Local
    +-- Notebook Fabric
    +-- Sandbox Fabric
    +-- API/GPU Fabric
```

## Connection invariants

1. A user only receives their own connections.
2. Raw secrets are never returned by the API after create.
3. Raw secrets are not written to operation journals or telemetry.
4. Provider family and authentication method are derived from the trusted provider catalog, never accepted from the client as authority.
5. Basic-user authorization is checked before provider connection creation.
6. A catalogued provider with no implemented adapter is rejected at connection time.
7. Connection validation is explicit and records evidence/status only.
8. A notebook runtime never gains F06 worker authority by virtue of being connected.

## Credential lifecycle

```
Connect
  -> validate provider definition
  -> validate credential shape
  -> encrypt at rest
  -> persist user-scoped connection
  -> explicit provider validation
  -> status CONNECTED / INVALID
```

Provider credentials are passed to adapters out-of-band for an individual operation. They are not embedded in NotebookOperationJournal request payloads.

## Extension rule

Adding a new provider should require:

1. Provider catalog definition.
2. Provider adapter implementing the provider's real capability model.
3. Connection authentication/credential mapping.
4. Provider live validation.
5. Role/capability tests.
6. No change to the public `compute.run` contract.

MCP is an access surface over this model, not an authority plane.