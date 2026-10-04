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

## Provider Connection Principle

The user-facing contract is **Connect -> Authorize/Guided Setup -> Verify -> Ready**.

Provider authentication is deliberately separated from provider execution. The UI must not require a normal user to discover provider IDs, organization/teamspace IDs, environment variable names, install provider CLIs, or paste raw API credentials when the provider offers a supported delegated web authorization flow.

The execution path remains:

```
User session
  -> Provider Connection
  -> provider adapter
  -> ComputeRouter
  -> Worker / Notebook / Sandbox execution
  -> CAS
  -> F07
```

The Connection Hub exposes an opaque `connectionId` and safe capability/status metadata. Raw secrets remain server-side and encrypted. They never enter client state after submission, operation journals, routing telemetry, MCP prompts, or F06 worker payloads.

### Connection experiences

- **OAUTH**: primary one-click delegated authorization. A provider-specific callback creates or refreshes the user-scoped connection.
- **GUIDED_MANUAL**: provider has no suitable delegated web authorization surface in ShortForge yet. Show friendly human labels and provider setup help; never expose raw environment-variable names as the primary UX.
- **MANUAL**: advanced/provider-admin surface where API credentials are currently the truthful integration boundary.

### Kaggle

Kaggle officially supports OAuth 2.0 for third-party web applications. Hosted ShortForge deployments should use a Kaggle **Organization OAuth client**, because Kaggle documents HTTPS redirect URIs for organization clients while public clients are localhost-only. Organization client token exchange is authenticated server-side with the organization owner's Kaggle API credentials; those credentials are an application secret and must never be exposed to ShortForge users.

ShortForge requests only notebook scopes:
`kernels.get:*`, `kernels.update:*`, `kernels.execute:*`, and `kernels.delete:*`.

Access tokens are short-lived; the refresh token is stored encrypted and rotated server-side. Token introspection is used to bind the connection to the Kaggle account identity.

Operational prerequisite for the hosted one-click flow:

- `KAGGLE_OAUTH_CLIENT_ID`
- `KAGGLE_OAUTH_CLIENT_TYPE=ORGANIZATION`
- `KAGGLE_OAUTH_ORG_USERNAME`
- `KAGGLE_OAUTH_ORG_API_KEY`
- `OAUTH_STATE_SECRET`

The deployment is not considered **OAuth-ready** until the Kaggle client has been registered and a real callback has been exercised.

### Lightning AI

Do **not** invent a Lightning OAuth connection. Current Lightning programmatic documentation uses `LIGHTNING_USER_ID` + `LIGHTNING_API_KEY` (or an interactive CLI login) for SDK/CLI automation. ShortForge therefore uses a guided programmatic connection for Lightning: User ID + API key + Teamspace, with human-readable labels and encrypted server-side storage.

A future official Lightning third-party authorization surface can be added under the same Connection Hub without changing the execution adapter.

### Advanced fallback

OAuth-capable providers may still expose an advanced token path for environments where OAuth registration is unavailable. Kaggle uses the modern `KAGGLE_API_TOKEN` as the preferred manual fallback; legacy `KAGGLE_USERNAME` + `KAGGLE_KEY` remains supported for compatibility.

### Non-negotiable safety rules

1. Provider completion is not artifact acceptance.
2. CAS owns immutable artifact identity.
3. F07 remains the independent physical truth boundary.
4. Connection does not grant F06 worker authority.
5. No self-hosted PandaStack sandbox is introduced by this UX work.
