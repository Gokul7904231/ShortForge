# ShortForge / FactoryOS — MCP Permission Contract

> **Status:** CANONICAL SECURITY EXTENSION
> **Purpose:** Define least-privilege rules for MCP integrations.

## 1. MCP is not ambient authority

Connecting an MCP server does not grant every worker access to every tool exposed by that server.

MCP access must be explicit, capability-bound, and scoped to a task/session.

## 2. Capability vocabulary

Reserved MCP capability names:

- `CAP_MCP_DRIVE_READ`
- `CAP_MCP_DRIVE_WRITE`
- `CAP_MCP_BROWSER_RESEARCH`
- `CAP_MCP_GITHUB_READ`
- `CAP_MCP_GITHUB_WRITE`

These names do not automatically exist in the executable CapabilityRegistry until implemented and tested.

## 3. Google Drive posture

### CAP_MCP_DRIVE_READ

Permits:

- Drive health
- bounded list/search
- metadata retrieval
- bounded download/export

Requires:

- authenticated Drive connection
- valid server process boundary
- local download containment
- provider response handling

Does not permit:

- ACL changes
- delete/trash
- publication
- release authorization
- arbitrary filesystem writes

### CAP_MCP_DRIVE_WRITE

Permits:

- create folder
- upload from an allowlisted local path

Requires all read conditions plus:

- explicit readwrite Drive scope
- explicit local source-path allowlist
- bounded file size
- audit/telemetry
- no implicit public sharing

The v0.1 Google Drive MCP does not expose permission mutation or public sharing.

## 4. Production worker rule

No F00-F07 worker receives MCP capabilities by default.

A worker using an MCP must have:

- explicit capability grant
- explicit skill declaration
- input/output schema
- tool budget
- timeout/cancellation behavior
- lease/fencing rules where the action is side-effecting
- verification expectations
- audit record

## 5. Operator rule

Human operators may use MCPs through an approved host, but human access does not waive FactoryOS production invariants.

An operator can inspect or export an artifact through Drive MCP without making that artifact verified or publishable.

## 6. Secret rule

MCP configuration must never embed:

- OAuth refresh tokens
- client secrets
- service-account private keys
- session cookies
- channel access tokens

Secrets remain environment/secret-manager concerns.

## 7. Filesystem rule

MCP filesystem access must be allowlisted.

For Google Drive MCP:

- uploads: `DRIVE_MCP_ALLOWED_UPLOAD_ROOTS`
- downloads: `DRIVE_MCP_DOWNLOAD_ROOT`

Path traversal and symlink escape must be denied.

## 8. Verification rule

MCP success is not production proof.

For media:

`MCP upload success != artifact verification != publication success`

Production truth continues to come from physical artifact evidence, F07 verification, and the delivery/release boundary.

## 9. Permission change routine

For any new MCP capability:

1. define role/floor/environment scope
2. define tool schemas
3. define filesystem/network side effects
4. define deny conditions
5. add positive and negative tests
6. run production-helper checks
7. record the decision in `.okf/decisions.md`
8. update the executable CapabilityRegistry before production use
