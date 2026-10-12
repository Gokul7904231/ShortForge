# Archived legacy test — Phase 13 economic routing

**Archived by Treasury Wave 7 (2026-10-12).**

This test asserted a hard-coded `AgentEconomicsEngine.routeTask()` tier/cost heuristic as though it represented model routing. That helper is advisory/compatibility-only and is not production economic admission. The old test is retained here as source history but removed from the executable suite. Current provider selection is tested through `CapabilityFirstRouter`; paid admission, reservation and settlement are tested through Treasury.

Original source path: `apps/web/factoryos/tests/phase13-economic-routing.test.ts`.

```typescript
import { describe, it, expect } from "vitest";
import { AgentEconomicsEngine } from "../core/cognitive/economics/AgentEconomicsEngine";

describe("FactoryOS Frontier v2 — Phase 13: Agent Economics & Model Routing Suite", () => {
  it("1. Multi-Tier Adaptive Routing: Selects cheapest viable model tier", () => {
    const engine = new AgentEconomicsEngine();

    // 1. Deterministic Rule
    const t0 = engine.routeTask("Restart single worker", { isDeterministicRuleAvailable: true });
    expect(t0.selectedTier).toBe("DETERMINISTIC");
    expect(t0.estimatedTokens).toBe(0);
    expect(t0.estimatedCost).toBe(0);

    // 2. Routine Low/Medium
    const t1 = engine.routeTask("Format task DAG summary", { severity: "LOW" });
    expect(t1.selectedTier).toBe("SMALL_FAST");
    expect(t1.estimatedCost).toBeLessThan(0.001);

    // 3. Ambiguous Case
    const t3 = engine.routeTask("Diagnose intermittent audio drift", { isAmbiguous: true });
    expect(t3.selectedTier).toBe("RECURSIVE_RLM");

    // 4. Critical Case
    const t4 = engine.routeTask("Multi-floor cascading crash", { severity: "CRITICAL" });
    expect(t4.selectedTier).toBe("MULTI_AGENT_SWARM");
  });
});
```
