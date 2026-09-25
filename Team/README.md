# ShortForge Team

Team is the operational home for the development-time engineering workforce and security stack.

## Authority boundary

.okf/ remains the absolute architecture and governance law for ShortForge. Team does not create a second authority plane.

Human / repository authority
→ .okf laws and canonical contracts
→ Team Change Gate
→ Forger Assembly
→ Security Stack
→ implementation / tests / evidence
→ Forger Report
→ merge / explicit escalation

A Team document may describe how to execute a rule. It may not silently weaken, replace, or reinterpret an .okf rule.

## Areas

- Team/workflow/ — mandatory change lifecycle.
- Team/forgers/ — specialist engineering workforce.
- Team/security/ — Semgrep, Strix, ZAP and production-helper integration.
- Team/contracts/ — semantic IR and machine-readable JSON contracts.
- Team/llm/ — Ascalon / ShortForge Cognitive Model protocol and training.
- Team/reports/ — per-change machine-readable reports.
- Team/scripts/ — deterministic Team validation helpers.

## Non-negotiable rule

Any non-trivial change must pass the Team Change Gate. A contradiction with an .okf law becomes a preserved conflict record; it is never silently overridden.

See Team/workflow/change-gate.md.
