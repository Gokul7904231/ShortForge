# Team Security Stack

Security is a layered evidence system, not a single scanner.

## Workers

### Semgrep Guard
Current routine static security lane for source-pattern risks and policy violations.

### Strix Adversary
Conditional dynamic/adversarial lane. Docker absence or skipped execution is **UNPROVEN**, never PASS.

### OWASP ZAP DAST
Authorized web/API dynamic security lane. Baseline/passive checks may be the normal CI lane. Active scans are attack traffic and require explicit owned/staging authorization. MCP-server testing remains inside an approved local/staging boundary.

### Production Helper
Canonical evidence station combining static scans, runtime traces, adversarial work and forensic checks. Helper reports are evidence, not authority.

## Security workflow

Authorize scope
→ static scan
→ dynamic/adversarial scan
→ DAST where applicable
→ adversarial/contract tests
→ preserve evidence
→ classify findings
→ repair/review
→ rescan
→ attach security evidence to Team report

No security worker can mint production permissions, waive Guardian checks, certify F07 or authorize release.
