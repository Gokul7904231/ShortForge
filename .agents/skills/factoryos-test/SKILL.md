---
name: factoryos-test
description: Canonical test runner skill for FactoryOS. Use when running golden missions, inspecting test reports, or evaluating real end-to-end execution.
---

# FactoryOS Test Runner Skill

## Invariants
1. Never fabricate upstream stage artifacts to force a test to pass.
2. Verify physical disk artifacts, SHA-256 byte digests, and media probe gates (`ffprobe`/`ffmpeg`).
3. Differentiate truth levels: `OBSERVED`, `VERIFIED`, `ASSERTED`, `INFERRED`, `UNKNOWN`.

## Commands
```bash
# Run the canonical golden short mission
npx tsx testing/cli/mission.ts golden-short-001

# Run with machine-readable JSON output
npx tsx testing/cli/mission.ts golden-short-001 --json
```

## Interpreting Verdicts
- `PASS` (Exit 0): All required floors executed genuinely, physical files exist on disk, 8 hard media gates passed, delivery verified.
- `FAIL` (Exit 1): Contract violation, broken artifact lineage, missing physical file, or gate failure. Inspect `findings` array.
- `BLOCKED` (Exit 2): Environment missing essential tools (e.g. `ffmpeg`).
