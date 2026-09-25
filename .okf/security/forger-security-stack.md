# ShortForge / FactoryOS — Forger Security Stack

> **Status:** GOVERNED ENGINEERING SECURITY WORKFORCE
> **Purpose:** Define the security specialization used by the Forger engineering workforce.

## 1. Security Forge architecture

The Security Forge combines existing production-helper controls with an explicit dynamic web/API security lane:

Security Task
  |
Scope + Authorization
  |
  +-- Semgrep Guard = STATIC
  +-- Strix Adversary = DYNAMIC
  +-- ZAP Sentinel = DAST
  |
Adversarial Tests
  |
Evidence Review
  |
Finding / Receipt
  |
Fix / Justify / Track
  |
Re-scan

The security stack is evidence-producing infrastructure. It is not an authority bypass and never grants a worker additional capabilities.

## 2. Semgrep Guard

Current status: EXISTING / ROUTINE

Source:
- production-helper/semgrep/rules/shortforge-rules.yaml
- production-helper/semgrep/reports/semgrep-report.json

Responsibilities:
- SSRF and unsafe fetch patterns
- path traversal
- dangerous command execution
- security-sensitive static patterns

Routine:
- run for security-sensitive code
- inspect every production-relevant finding
- fix, justify, or formally track
- retain report provenance

Historical recorded run:
- 522 files scanned
- 75 static findings
- 65 dangerous-fetch / SSRF warnings
- 6 path-traversal warnings
- 4 command-execution warnings

These counts are historical evidence, not current status.

## 3. Strix Adversary

Current status: EXISTING / CONDITIONAL

Source:
- production-helper/strix/prompts/shortforge-audit-instructions.md

Responsibilities:
- dynamic adversarial exploration
- prompt-injection/security-boundary challenges
- runtime attack-path discovery

Absolute evidence rule:
- Docker unavailable = UNPROVEN
- no dynamic run = no dynamic coverage claim
- successful run requires preserved evidence
- partial execution must be disclosed

## 4. ZAP Sentinel

Current status: ADOPTION CANDIDATE / ROUTINE DESIGN

ZAP adds a dedicated dynamic application-security lane for web/API surfaces.

The official ZAP project provides:
- an Automation Framework controlled by YAML plans
- passive and active scanning
- API/OpenAPI/GraphQL import paths
- report generation
- GitHub Actions integration
- an MCP Integration add-on that can inspect and scan MCP servers

Safety rules:
- only scan targets explicitly owned or authorized by ShortForge
- baseline/passive scanning is the normal CI/CD lane
- active scanning requires explicit staging/test authorization
- no production attack scanning without explicit authorization and a controlled window
- secrets and authenticated sessions are injected through secure runtime mechanisms
- reports are evidence, not direct authority

## 5. MCP security specialization

The Security Forge should review ShortForge MCP servers.

For the Google Drive MCP:
- filesystem containment
- least-privilege Drive scopes
- root-folder containment
- path traversal and symlink escape
- read-only/write-mode separation
- missing credentials
- duplicate and failure behavior
- authorized ZAP MCP scanning for localhost/staging endpoints

ZAP's official MCP integration guidance warns that its MCP server should not be exposed to external networks.

## 6. Security evidence taxonomy

Use the canonical helper evidence classes:
- TEST_VERIFIED
- LIVE_VERIFIED
- SECURITY_SCAN
- STATIC_WARNING
- BLOCKED
- UNPROVEN
- OBSERVED_MEASUREMENT

No scanner score or "no findings" result overrides architecture invariants.

## 7. Security Forge denial rules

The Security Forge cannot:
- grant itself privileged runtime access
- read production secrets merely to test a hypothesis
- disable Guardian
- disable F07
- remove security controls to make a test pass
- suppress findings without an evidence-backed disposition
- label a blocked scanner run as PASS
- actively scan an unauthorized target

## 8. Relationship to production-helper

production-helper remains the canonical execution station.

The Security Forge is the developer workforce that uses it.

Forger Sentinel
  |
  +-- production-helper / Semgrep
  +-- production-helper / Strix
  +-- ZAP DAST lane when promoted
  +-- adversarial tests
  |
  v
Evidence
  |
.okf audit / decision

The Forger is an operator of security evidence, not the owner of security authority.
