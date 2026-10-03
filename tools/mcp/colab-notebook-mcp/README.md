# ShortForge Colab Notebook MCP

Provider-specific MCP for Google Colab.

## Design

ShortForge keeps two Colab boundaries separate:

1. **Control plane** — `ColabNotebookAdapter` talks to the official Colab Runtime API for credential validation and runtime lifecycle.
2. **Browser bridge** — the MCP package exposes a bounded localhost bridge for connecting a Colab browser session to an agent-facing MCP workflow.

The browser bridge does **not** grant F06 worker authority, access the ShortForge CAS, or bypass release gates.

## Research basis

The official Google repository `googlecolab/colab-mcp` is a local-agent/browser bridge. It uses a localhost WebSocket server, a per-process proxy token/port, Colab-origin validation, and a dynamic downstream tool surface. The upstream README also requires an MCP client that supports `notifications/tools/list_changed` and runs locally.

ShortForge intentionally keeps the same transport concepts but improves the management boundary:

- Existing notebook URLs are accepted after strict host/path validation.
- Optional `authuser` selection is supported for multi-account browser profiles.
- Every connection receives a unique `sf_mcp_nonce` query parameter to reduce Chrome tab reuse against stale fragments.
- Every session gets its own loopback WebSocket server, token, and port, allowing independent session state.
- Status tools never return the secret token.
- Only the official Colab origins are accepted.
- Unauthorized origin/token connections are rejected.
- Connection/session tools are registered eagerly, so the basic MCP surface is available before a browser session connects.
- SIGINT/SIGTERM cleanup closes every local bridge server.

These choices address documented upstream/community pain points around dynamic tool registration, stale browser connections, existing-notebook targeting, and single-session limitations.

## Tools

- `colab_connection_check`
- `colab_capabilities`
- `colab_browser_connection_info`
- `colab_open_browser_connection`
- `colab_disconnect_browser_connection`
- `colab_close_browser_connection`

The browser bridge currently provides **session/transport orchestration**. It does not pretend to expose Colab cell-editing tools until a verified MCP proxy for the downstream browser session is added.

## Example

Open an existing notebook:

```text
colab_open_browser_connection(
  notebook_url="https://colab.research.google.com/drive/<FILE_ID>",
  open_browser=true
)
```

The returned `connectUrl` contains the browser connection fragment. The returned `manualConnection` contains the token/port pair for the Colab "Connect to a local MCP server" dialog.

## Security boundary

The bridge binds only to `127.0.0.1`. It accepts only the two known Colab origins and validates a per-session bearer/query token.

The bridge is an interoperability layer, not a production execution authority. F06 admission, leases/fencing, CAS, F07 artifact acceptance, and ReleaseAuthorization remain outside this package.

## Tests

```bash
npm install --no-audit --no-fund
npm run typecheck
npm test
```
