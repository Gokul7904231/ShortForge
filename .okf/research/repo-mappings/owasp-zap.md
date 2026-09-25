# Repository Mapping: zaproxy/zaproxy

> **Status:** SECURITY ENGINEERING STACK CANDIDATE
> **Adoption Mode:** ISOLATED SECURITY PROVIDER / DAST
> **Scope:** authorized web/API dynamic security scanning and MCP-server security testing

- Repository: zaproxy/zaproxy
- URL: https://github.com/zaproxy/zaproxy
- Upstream License: Apache-2.0
- ShortForge Mapping: Forge Sentinel / production-helper security lane

## 1. Useful mechanisms

ZAP provides:
- passive web/API scanning
- active application scanning
- API/OpenAPI/GraphQL import paths
- automation plans
- report generation
- CI/CD integration
- MCP server import/scanning through its MCP Integration add-on

The Automation Framework is YAML-driven and supports jobs for scanning, passive-wait, reporting, API imports, and MCP import.

## 2. ShortForge use

The Security Forge uses ZAP to cover a class of defects that static Semgrep rules cannot prove and dynamic agent attack tests do not necessarily reproduce:

Semgrep = source-pattern evidence
Strix = adversarial runtime behavior
ZAP = web/API protocol and DAST evidence

## 3. MCP-specific use

ShortForge MCP servers create an additional HTTP/JSON-RPC attack surface when deployed over a network.

ZAP can import an MCP server, perform the MCP handshake, enumerate tools/resources/prompts, capture requests, and apply its passive/active scanning and fuzzing machinery.

This is especially relevant to:
- Google Drive MCP
- future remote MCP endpoints
- authenticated staging APIs exposing tool endpoints

The scan must remain inside an authorized staging/local boundary.

## 4. Safety boundary

Active ZAP scans are attack traffic.

Therefore:
- production is deny-by-default
- owned/staging targets require explicit authorization
- scan scope must be recorded
- authenticated tokens must be injected securely
- reports must be retained
- blocked or skipped scans are UNPROVEN, not PASS

## 5. What is not adopted

ShortForge does not treat:
- no alerts
- scanner exit code alone
- a baseline report alone

as proof that the architecture is secure.

Scanner output is one evidence source inside the broader zero-trust, capability, adversarial-testing, and production-helper model.
