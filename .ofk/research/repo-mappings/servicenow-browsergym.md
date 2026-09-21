# Repository Mapping: ServiceNow/BrowserGym

- **Repository**: `ServiceNow/BrowserGym`
- **URL**: `https://github.com/ServiceNow/BrowserGym`
- **Owner**: `ServiceNow`
- **Reviewed Version**: `v0.3.x` (Snapshot 2026)
- **Date Studied**: `2026-09-09`
- **Upstream License**: `Apache-2.0`
- **Adoption Mode**: `ISOLATED_PROVIDER / BENCHMARK_SOURCE`
- **Implementation Status**: `RESEARCH_ONLY`

---

## 1. Problem Solved
Benchmarking AI agents interacting with web pages in realistic web environments requires standardized action spaces, DOM extraction, and goal-directed task rewards.

## 2. Important Mechanisms
- Gym-style environment interfaces for web tasks (`reset`, `step`, `observe`).
- DOM simplification and accessible coordinate mapping.
- Structured reward calculation based on completed web objectives.

## 3. FactoryOS Mapping
- **FactoryOS Concept**: Future Web/UI Autonomous Mission Benchmark.
- **FactoryOS Destination**:
  - `testing/suites/browser/` (Future home for UI-driven ShortForge web missions)
- **Existing Agents/Capabilities Affected**:
  - Future UI automation agents executing creator flows in the browser.

## 4. What Was Adopted
- Architectural reference for designing future web-agent mission suites (e.g. login, create project, configure video, inspect delivery).
- Strict separation between the browser environment and backend execution truth.

## 5. What Was NOT Adopted
- Did NOT install python `browsergym` into the core FactoryOS repository during Phase 1.
- Did NOT create fake browser screenshots or synthetic DOM traces.

## 6. Security & Licensing Considerations
- Apache-2.0 License. Research reference only.

## 7. Validation Performed
- Architectural boundary documented; Phase 1 prioritizes backend canonical mission execution before full web browser automation suites.
