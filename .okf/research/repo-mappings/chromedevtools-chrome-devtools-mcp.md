# Repository Mapping: ChromeDevTools/chrome-devtools-mcp

- **Repository**: `ChromeDevTools/chrome-devtools-mcp`
- **URL**: `https://github.com/ChromeDevTools/chrome-devtools-mcp`
- **Owner**: `ChromeDevTools`
- **Reviewed Version**: `v0.1.x` (Snapshot 2026)
- **Date Studied**: `2026-09-09`
- **Upstream License**: `Apache-2.0`
- **Adoption Mode**: `ISOLATED_PROVIDER`
- **Implementation Status**: `ADOPTED` (Development / Test Environment Only)
- **Forger Owner**: **Forge Browser**

---

## 1. Problem Solved
AI coding assistants and automated E2E harnesses require direct, programmatic inspection of web applications (DOM, network events, console logs, performance metrics, screenshots) without relying on fragile synthetic browser mocks.

## 2. Important Mechanisms
- Model Context Protocol (MCP) server wrapping Chrome DevTools Protocol (CDP).
- Remote debugging endpoint connection (`http://127.0.0.1:9222`).
- Structured extraction of network logs, console errors, page screenshots, and DOM snapshots.

## 3. FactoryOS Mapping
- **FactoryOS Concept**: Development & Browser Testing Infrastructure.
- **FactoryOS Destination**:
  - `testing/runtime/ChromeDevToolsClient.ts`
  - `.agents/docs/mcp-chrome-devtools.md`
  - `.okf/intelligence/forgers.md` -> Forge Browser
- **Existing Agents/Capabilities Affected**:
  - Antigravity IDE browser testing and UI bug reproduction.
  - Testing harness: captures browser evidence attached to `EvidenceGraph`.

## 4. What Was Adopted
- MCP configuration pattern connecting Antigravity to Chrome DevTools over local loopback (`http://127.0.0.1:9222`).
- Structured browser evidence capture model (`URL`, `DOM summary`, `console messages`, `network events`, `screenshot reference`).
- A specialist Browser Forger owns maintenance of the integration, browser evidence collection, and E2E regression work.

## 5. What Was NOT Adopted
- NOT exposed to FactoryOS production workers or cloud instances.
- Did NOT permit the MCP server to launch unconstrained external browser sessions.
- Does not become a second browser truth authority when gstack browser workflows are used.

## 6. Security & Licensing Considerations
- Apache-2.0 License.
- High-privilege development capability: restricted strictly to localhost (`127.0.0.1`), development environments, and isolated test scenarios.
- Strict security boundary prevents production SSRF or credentials leakage.
- Browser Forger output remains evidence and cannot certify backend media artifacts.

## 7. Validation Performed
- Documented and validated local CDP connection semantics, ensuring browser evidence records integrate into `EvidenceGraph`.

## 8. Forger maintenance contract

Forge Browser owns:
1. MCP configuration health
2. CDP connection regression
3. browser evidence schema compatibility
4. UI/E2E scenario maintenance
5. evidence attachment correctness
6. separation of browser observations from backend truth

Any change to the Chrome DevTools MCP boundary should be reviewed with the complete .okf sweep and the applicable production-helper/security routine.
