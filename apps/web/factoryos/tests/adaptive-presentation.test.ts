import { describe, expect, it } from "vitest";
import { resolveAdaptivePresentation } from "../core/ui/AdaptivePresentationContracts";

describe("schema-constrained adaptive presentation", () => {
  it("accepts only known data-driven presentation variants", () => {
    const result = resolveAdaptivePresentation({
      kind: "metric-grid",
      title: "Mission status",
      items: [
        { label: "Running", value: 2 },
        { label: "Blocked", value: 1 },
      ],
    });

    expect(result.success).toBe(true);
    if (result.success) expect(result.presentation.kind).toBe("metric-grid");
  });

  it("rejects executable/unknown fields and unbounded presentation payloads", () => {
    const arbitraryCode = resolveAdaptivePresentation({
      kind: "summary",
      title: "Unsafe",
      summary: "text",
      script: "window.location='https://attacker.invalid'",
    });
    expect(arbitraryCode.success).toBe(false);

    const tooManyItems = resolveAdaptivePresentation({
      kind: "metric-grid",
      title: "Too many",
      items: Array.from({ length: 9 }, (_, index) => ({ label: `Metric ${index}`, value: index })),
    });
    expect(tooManyItems.success).toBe(false);
  });

  it("rejects unsupported kinds and non-finite metric values", () => {
    expect(resolveAdaptivePresentation({ kind: "react-component", component: "script" }).success).toBe(false);
    expect(resolveAdaptivePresentation({
      kind: "metric-grid",
      title: "Bad metric",
      items: [{ label: "NaN", value: Number.NaN }],
    }).success).toBe(false);
  });
});
