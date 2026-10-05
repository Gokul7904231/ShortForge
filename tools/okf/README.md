# OKF Control Plane Tooling

`tools/okf` compiles the existing `.okf` corpus into deterministic governance evidence.

## Commands

From the repository root:

    python -m pip install PyYAML
    python -m tools.okf.lint
    python -m tools.okf.sweep --base origin/main --head HEAD --output okf-sweep.json
    python -m tools.okf.validate_report Team/reports/pr-<number>.json

## What this wave makes machine-verifiable

- the complete `.okf` tree is inventoried and hashed;
- active rules have stable IDs, owners, scopes, source references, and enforcement declarations;
- changed paths are mapped to applicable rules;
- `.okf` changes expand the applicability set to all active rules;
- sweep state and provenance are emitted as an evidence envelope;
- Team reports are rejected when UNPROVEN/BLOCKED security evidence is marked PASS;
- the envelope hash makes tampering detectable.

This tooling does not replace domain validators, Guardian authorization, F07 verification, production-helper evidence, or GitHub branch/ruleset enforcement. Those remain separate control layers.

The signing field is intentionally PLANNED in the manifest. Hashing is implemented in this wave; cryptographic signing is a later promotion.
