# Repository Mapping: affaan-m/ECC

- **Repository**: `affaan-m/ECC` (Everything Coding Claude / Agentic Engineering Conventions)
- **URL**: `https://github.com/affaan-m/ECC`
- **Owner**: `affaan-m`
- **Reviewed Version**: `main` (Snapshot 2026)
- **Date Studied**: `2026-09-09`
- **Upstream License**: `MIT`
- **Adoption Mode**: `PATTERN_EXTRACTION`
- **Implementation Status**: `ADOPTED`

---

## 1. Problem Solved
AI coding assistants often lack structured conventions for engineering tasks, leaping into code changes without reconnaissance, skipping tests, inventing competing abstractions, or failing to record provenance.

## 2. Important Mechanisms
- Strict separation of engineering concerns: skills, rules, hooks, memory, and workflows.
- Rigorous development loop: `INSPECT` → `MAP` → `PLAN` → `IMPLEMENT` → `TEST` → `OBSERVE` → `VERIFY` → `DOCUMENT`.
- Bounded modification discipline: touch only targeted files; verify minimal diffs before expanding scope.
- Anti-hallucination gates: never claim a component works without running actual verification commands.

## 3. FactoryOS Mapping
- **FactoryOS Concept**: Antigravity Engineering Workflow & Skills Architecture.
- **FactoryOS Destination**:
  - `.agents/skills/factoryos-test/SKILL.md`
  - `.agents/skills/factoryos-evidence/SKILL.md`
  - `.agents/skills/factoryos-graph/SKILL.md`
  - `.agents/skills/factoryos-repo-assimilation/SKILL.md`
  - `.agents/skills/factoryos-verify/SKILL.md`
  - `.agents/rules/factoryos-engineering-discipline.md`
  - `.agents/workflows/canonical-development-loop.md`
- **Existing Agents/Capabilities Affected**:
  - Antigravity IDE coding assistant and developer pairing layer.

## 4. What Was Adopted
- The modular organization of developer skills under `.agents/skills/`.
- The canonical development loop requiring repo reconnaissance and internal mapping before code modifications.
- Explicit verification requirement before claiming task completion.

## 5. What Was NOT Adopted
- Did NOT install ECC's agent persona hierarchy (FactoryOS already has Overseer, Slayers, Guardians, Healers).
- Did NOT introduce redundant prompt orchestrators; skills are loaded on-demand by Antigravity IDE natively.

## 6. Security & Licensing Considerations
- MIT License. Clean-room conceptual extraction of engineering guidelines. Zero proprietary files copied.

## 7. Validation Performed
- Validated that `.agents/skills/` conforms strictly to Antigravity IDE skill specifications with YAML frontmatter.
