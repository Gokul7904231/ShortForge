# Chrome DevTools MCP Configuration & Security Boundary

## Overview
Chrome DevTools MCP enables Antigravity and the testing system to inspect browser sessions, capture DOM states, network requests, console errors, and screenshots for UI verification.

## Upstream Configuration
Antigravity connects via `chrome-devtools-mcp` on loopback:
```bash
npx -y chrome-devtools-mcp@latest --browser-url=http://127.0.0.1:9222
```

## Security Boundary Invariants
1. **Local Loopback Only**: The MCP server and testing client (`ChromeDevToolsClient.ts`) are hard-coded to communicate only with `http://127.0.0.1:9222`.
2. **Development & Test Scenarios Only**: Never exposed to autonomous production workers or multi-tenant user flows.
3. **Evidence Grounding**: Browser observations are saved as `SituationEvidenceRef` and attached to `EvidenceGraph`—screenshots alone never substitute for backend media verification.
