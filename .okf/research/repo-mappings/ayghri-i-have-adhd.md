# Repository Mapping: ayghri/i-have-adhd

- **Repository**: `ayghri/i-have-adhd`
- **URL**: `https://github.com/ayghri/i-have-adhd`
- **Owner**: `ayghri`
- **Reviewed Version**: `main` (Snapshot 2026)
- **Date Studied**: `2026-09-09`
- **Upstream License**: `MIT`
- **Adoption Mode**: `PATTERN_EXTRACTION`
- **Implementation Status**: `ADOPTED`

---

## 1. Problem Solved
AI agents in complex software engineering and multi-agent coordination often suffer from verbosity, tangential reasoning, unbounded exploration, and unclear status tracking, which degrades user comprehension and increases execution entropy.

## 2. Important Mechanisms
- Action-first prompting: immediately declare the state and action before executing.
- Bounded numbered steps: limit cognitive operations to sequential, explicit stages.
- Explicit progress markers: unambiguous declaration of `State`, `Action`, `Result`, and `Next Step`.
- Strict tangential suppression: eliminate discursive explanations and speculative tangents.
- Concise error reporting: state the failure symptom, root cause hypothesis, and bounded fix candidate.

## 3. FactoryOS Mapping
- **FactoryOS Concept**: Engineering Output Discipline & Comms Protocol.
- **FactoryOS Destination**:
  - `.agents/rules/i-have-adhd-discipline.md`
  - `testing/model/SituationRecord.ts` (Structured Comms protocol separating situation from prose)
- **Existing Agents/Capabilities Affected**:
  - Antigravity pair-programming agent workflow.
  - FactoryOS Comms: Situation Records deliver action-first summaries without cluttering the control plane.

## 4. What Was Adopted
- Output discipline for Antigravity engineering interactions:
  1. Current State
  2. Bounded Action
  3. Concrete Verification Result
  4. Immediate Next Step
- Strict suppression of unsupported prose speculation in testing reports and situation messages.

## 5. What Was NOT Adopted
- Did NOT enforce rigid terse formatting on creative storytelling floors (Floor 02 Scripting requires narrative depth).
- Did NOT replace existing rich telemetry objects with raw text bullet points.

## 6. Security & Licensing Considerations
- MIT License allows clean pattern extraction with zero proprietary IP contamination.
- Pure behavioral pattern; zero external code installed.

## 7. Validation Performed
- Validated that test runner and situation records output concise, actionable status updates without runaway prose.
