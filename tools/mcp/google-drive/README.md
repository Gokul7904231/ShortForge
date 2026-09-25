# ShortForge Google Drive MCP

A repository-owned MCP boundary for bounded Google Drive access.

## Why this exists

FactoryOS already has a canonical Google Drive delivery provider and a durable delivery outbox:

- `apps/web/storage/providers/google-drive.ts`
- `apps/web/factoryos/core/adapters/DriveDeliveryAdapter.ts`

This MCP does **not** replace those paths.

It provides operator/developer tooling for:

- listing and searching Drive
- reading file metadata
- creating folders
- uploading an explicitly allowlisted local file
- downloading to a bounded local directory
- exporting Google Docs/Sheets/Slides
- checking Drive health/quota

Production publishing remains governed by the FactoryOS path:

`physical artifact -> CAS -> F07 -> ReleaseAuthorization -> DeliveryAdapter`

## Security posture

The v0.1 server intentionally does not expose:

- delete/trash
- ACL/permission mutation
- public-link generation
- release/publish authorization
- arbitrary filesystem reads
- arbitrary filesystem writes

Uploads are disabled unless `GOOGLE_DRIVE_MCP_SCOPE_MODE=readwrite`.

Local file access is allowlisted by `DRIVE_MCP_ALLOWED_UPLOAD_ROOTS`; downloads are constrained to `DRIVE_MCP_DOWNLOAD_ROOT`.

The server never creates an `anyone:reader` permission. The existing production storage provider may still have legacy/public-link behavior; this MCP does not inherit that behavior.

## Authentication

Two authentication modes are supported:

1. Service account:
   - `GOOGLE_APPLICATION_CREDENTIALS`
   - share the target Drive folder with the service account.
2. OAuth refresh token:
   - `GOOGLE_DRIVE_CLIENT_ID`
   - `GOOGLE_DRIVE_CLIENT_SECRET`
   - `GOOGLE_DRIVE_REFRESH_TOKEN`

Default scope posture is read-only.

## Setup

From the repository root:

```bash
cd tools/mcp/google-drive
npm install
copy .env.example .env
```

Populate credentials, then run:

```bash
npm run typecheck
npm run start
```

For local debugging:

```bash
npm run inspect
```

## Host configuration

For a stdio MCP client, use the equivalent of:

```json
{
  "mcpServers": {
    "shortforge-google-drive": {
      "command": "npx",
      "args": ["tsx", "tools/mcp/google-drive/src/index.ts"],
      "cwd": "/absolute/path/to/ShortForge"
    }
  }
}
```

Do not put secrets in this configuration file.

## Operational rule

The MCP is an **integration surface**, not a new authority plane.

Never use it to bypass:

- Overseer authority
- Guardian policy/leases
- AgentRuntime capability attenuation
- CAS immutability
- F07 verification
- ReleaseAuthorization

For production worker access, prefer the existing internal adapters and capability registry.
