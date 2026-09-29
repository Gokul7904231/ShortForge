import { afterEach, describe, expect, it, vi } from "vitest";
import { CLMDecisionAdapter } from "../core/intelligence/decision/CLMDecisionAdapter";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const baseRequest = {
  batchId: "clm-test",
  questions: [
    { id: "route", type: "CHOICE" as const, question: "Route?", options: ["local", "amd", "kaggle"] as const },
    { id: "ready", type: "NOUL" as const, question: "Ready?" },
    {
      id: "quality", type: "SCORE" as const, question: "Quality?",
      rubric: [
        { level: 1, label: "LOW", description: "Low" },
        { level: 2, label: "MEDIUM", description: "Medium" },
        { level: 3, label: "HIGH", description: "High" },
      ],
    },
  ],
};

describe("CLM Decision Adapter reconciliation", () => {
  it("is disabled by default and therefore cannot become the decision authority", async () => {
    const adapter = new CLMDecisionAdapter({
      baseUrl: "https://clm.example",
      allowedOrigins: ["https://clm.example"],
    });
    const result = await adapter.evaluateBatch(baseRequest);
    expect(result.adapterUsed).toBe("CLM_SHADOW");
    expect(result.status).toBe("UNRESOLVED");
    expect(result.shouldEscalate).toBe(true);
    expect(result.adapterMetadata?.isProductionAuthority).toBe(false);
    expect(result.adapterMetadata?.isTrainingEligible).toBe(false);
  });

  it("requires an explicit origin allowlist when enabled", async () => {
    const adapter = new CLMDecisionAdapter({
      baseUrl: "https://clm.example",
      enabled: true,
      allowedOrigins: [],
    });
    const result = await adapter.evaluateBatch(baseRequest);
    expect(result.status).toBe("UNRESOLVED");
    expect(result.answers.every((answer) => answer.status === "INVALID")).toBe(true);
  });

  it("parses valid typed answers and preserves candidate-relative probability semantics", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        answers: {
          route: {
            type: "choice",
            choice: "amd",
            confidence: 0.82,
            probabilities: { local: 0.08, amd: 0.82, kaggle: 0.10 },
          },
          ready: { type: "noul", noul: 0.91 },
          quality: {
            type: "score",
            score: 1.4,
            probabilities: { "0": 0.1, "1": 0.5, "2": 0.4 },
            confidence: 0.7,
          },
        },
      }),
      text: async () => "",
    }));

    const adapter = new CLMDecisionAdapter({
      baseUrl: "https://clm.example",
      allowedOrigins: ["https://clm.example"],
      enabled: true,
    });

    const result = await adapter.evaluateBatch(baseRequest);
    expect(result.status).toBe("VALID");
    expect(result.adapterMetadata?.probabilitySemantics).toBe("CANDIDATE_RELATIVE");
    expect(result.answersById.route.type).toBe("CHOICE");
    expect(result.answersById.ready.type).toBe("NOUL");
    expect(result.answersById.ready.confidence).toBe(0);
    expect(result.answersById.quality.type).toBe("SCORE");

    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.questions.route.criteria).toEqual({ local: "local", amd: "amd", kaggle: "kaggle" });
    expect(body.decisionSchemaVersion).toBe("2.1.0");
  });

  it("fails closed on malformed distributions and undeclared candidates", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        answers: {
          route: {
            type: "choice",
            choice: "invented",
            confidence: 0.99,
            probabilities: { local: 0.4, amd: 0.4, kaggle: 0.2 },
          },
        },
      }),
      text: async () => "",
    }));

    const result = await new CLMDecisionAdapter({
      baseUrl: "https://clm.example",
      allowedOrigins: ["https://clm.example"],
      enabled: true,
    }).evaluateBatch({
      batchId: "clm-invalid",
      questions: [baseRequest.questions[0]],
    });

    expect(result.status).toBe("UNRESOLVED");
    expect(result.answers[0].status).toBe("INVALID");
    expect(result.answers[0].validationErrorCode).toBe("INVALID_ENUM");
    expect(result.adapterMetadata?.isTrainingEligible).toBe(false);
  });

  it("fails closed when the backend is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connection refused")));

    const result = await new CLMDecisionAdapter({
      baseUrl: "https://clm.example",
      allowedOrigins: ["https://clm.example"],
      enabled: true,
    }).evaluateBatch({
      batchId: "clm-unavailable",
      questions: [baseRequest.questions[1]],
    });

    expect(result.status).toBe("UNRESOLVED");
    expect(result.shouldEscalate).toBe(true);
  });
});
