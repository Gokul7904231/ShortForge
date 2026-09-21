# FactoryOS Canonical Testing System

The canonical system-level evaluation instrument for ShortForge / FactoryOS.

## 1. Mission & Philosophy
FactoryOS is an autonomous 8-floor hierarchy for content generation.
This testing system does **not** introduce another agent or oracle layer; it **observes, records, reconstructs, evaluates, compares, and reports** on the existing hierarchy.

### The Anti-Cheating Invariants:
1. **Never manufacture stage outputs**: If Floor 01 is supposed to execute, execute Floor 01. Downstream floors consume upstream outputs; tests must never inject pre-baked artifacts merely to make the pipeline pass.
2. **Physical verification over assertions**: An artifact is not verified because a string exists in memory. It must physically exist on disk, match its SHA-256 byte digest, and pass media format and stream decodability gates (`ffprobe` and `ffmpeg`).
3. **Explicit Truth Levels**:
   - `OBSERVED`: Directly observed from runtime execution or physical disk state.
   - `VERIFIED`: Independently verified against authoritative evidence.
   - `ASSERTED`: Claimed by a system or agent.
   - `INFERRED`: Derived by evaluator interpretation.
   - `UNKNOWN`: Evidence insufficient.
   - `RECONSTRUCTED`: Deterministically derived from multiple observed records.
4. **Transparent Degradation**: If an external provider is unconfigured (e.g. Gemini TTS API key in offline dev), the system truthfully records `REAL_WITH_DEGRADED_FALLBACK`, never disguising fallback as pristine primary execution.

---

## 2. Test Taxonomy

| Category | Purpose |
| :--- | :--- |
| **UNIT** | Proves isolated individual components and mathematical functions. |
| **INTEGRATION** | Proves boundary interactions between two subsystems. |
| **CONTRACT** | Proves schema, envelope, and metadata agreements between floors. |
| **SYSTEM** | Proves coordinated runtime multi-agent execution across swarms. |
| **REAL-MISSION** | Proves genuine end-to-end mission paths from user command to delivery outbox. |
| **RECOVERY** | Proves containment, retry, and fallback behavior under injected failures. |
| **TRAJECTORY** | Judges the graph and sequence of agent actions against dependency rules. |
| **REGRESSION** | Compares baseline vs candidate runs to identify performance or semantic deltas. |
| **BENCHMARK** | Measures repeatable scores, duration, and token economics across datasets. |
| **BROWSER** | Proves user-facing web behavior using Chrome DevTools Protocol. |
| **REPLAY** | Validates determinism by replaying recorded workflow history traces. |

---

## 3. Directory Structure

```
testing/
├── config/             # Test configuration, environment probe, and thresholds
├── contracts/          # Mission, floor, execution, and artifact contracts
├── fixtures/           # Golden mission JSON specifications
├── runtime/            # MissionRunner, ExecutionRecorder, ArtifactObserver, ChromeDevToolsClient
├── model/              # MissionRun, Finding (Archify-inspired), Receipt, SituationRecord
├── graphs/             # MissionGraph, EvidenceGraph, GraphValidator, GraphDiff, Projections
├── oracles/            # State, Artifact, Contract, Goal, Trajectory, Recovery, Quality Oracles
├── judges/             # Deterministic lineage, verification, and delivery judges
├── scenarios/          # Golden mission definitions (e.g. golden-short-001)
├── replay/             # Replay history and state snapshot models
├── reports/            # Structured MissionReport model and JSON/Markdown serializers
└── cli/                # CLI runners: test:mission and test:all
```

---

## 4. Running Missions

### Golden Short Mission
```bash
# Run golden mission with human-readable summary
npx tsx testing/cli/mission.ts golden-short-001

# Run golden mission with machine-readable JSON output
npx tsx testing/cli/mission.ts golden-short-001 --json

# Run all test suites
npx tsx testing/cli/test.ts
```

### Exit Codes:
- `0`: **PASS** — All required floors executed, physical artifacts verified on disk, media hard gates passed, and outbox delivery confirmed.
- `1`: **FAIL** — Broken contracts, missing physical artifacts, hard gate rejection, or illegal DAG order.
- `2`: **BLOCKED / ERROR** — Unhandled execution exception or environment blockage.
