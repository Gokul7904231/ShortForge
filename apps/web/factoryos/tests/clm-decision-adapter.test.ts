import { describe, it, expect, vi, afterEach } from "vitest";
import { CLMDecisionAdapter } from "../core/intelligence/decision/CLMDecisionAdapter";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("CLM Decision Adapter", () => {
  it("parses typed CLM decisions without promoting the backend to authority", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        model: "clm-latest",
        answers: {
          worker: {
            type: "choice",
            choice: "amd",
            confidence: 0.82,
            probabilities: { local: 0.08, amd: 0.82, kaggle: 0.10 },
          },
          ready: { type: "noul", noul: 0.91 },
          quality: {
            type: "score",
            score: 1.4,
            confidence: 0.7,
            probabilities: { "0": 0.1, "1": 0.5, "2": 0.4 },
          },
        },
      }),
      text: async () => "",
    }));

    const adapter = new CLMDecisionAdapter({ baseUrl: "http://clm.test" });
    const result = await adapter.evaluateBatch({
      batchId: "clm_01",
      questions: [
        { id: "worker", type: "CHOICE", question: "Which worker?", options: ["local", "amd", "kaggle"] },
        { id: "ready", type: "NOUL", question: "Is the worker ready?" },
        {
          id: "quality", type: "SCORE", question: "Rate quality",
          rubric: [
            { level: 1, label: "LOW", description: "Low" },
            { level: 2, label: "MEDIUM", description: "Medium" },
            { level: 3, label: "HIGH", description: "High" },
          ],
        },
      ],
      sharedContext: { provider: "AMD" },
    });

    expect(result.adapterUsed).toBe("CLM_SHADOW");
    expect(result.adapterMetadata?.isProductionAuthority).toBe(false);
    expect(result.adapterMetadata?.isTrainingEligible).toBe(false);
    expect(result.adapterMetadata?.probabilitySemantics).toBe("CANDIDATE_RELATIVE");
    expect(result.answersById.worker.type).toBe("CHOICE");
    expect(result.answersById.worker.status).toBe("VALID");
    expect(result.answersById.quality.type).toBe("SCORE");
  });

  it("fails closed on malformed candidate distributions instead of selecting a default", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        answers: {
          route: {
            type: "choice",
            choice: "invented",
            confidence: 0.99,
            probabilities: { local: 0.4, amd: 0.4 },
          },
        },
      }),
      text: async () => "",
    }));

    const result = await new CLMDecisionAdapter({ baseUrl: "http://clm.test" }).evaluateBatch({
      batchId: "clm_02",
      questions: [{ id: "route", type: "CHOICE", question: "Route", options: ["local", "amd"] }],
    });

    expect(result.status).toBe("UNRESOLVED");
    expect(result.answers[0].status).toBe("INVALID");
    expect(result.answers[0].validationErrorCode).toBe("INVALID_ENUM");
    expect(result.adapterMetadata?.isTrainingEligible).toBe(false);
  });

  it("treats missing NOUL confidence as missing evidence, not as calibrated confidence", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ answers: { ready: { type: "noul", noul: 0.51 } } }),
      text: async () => "",
    }));
    const result = await new CLMDecisionAdapter({ baseUrl: "http://clm.test" }).evaluateBatch({
      batchId: "clm_03", questions: [{ id: "ready", type: "NOUL", question: "Ready?" }],
    });
    const answer = result.answersById.ready;
    expect(answer.confidence).toBe(0);
    expect(answer.uncertainty?.calibrationStatus).toBe("UNCALIBRATED");
    expect(answer.uncertainty?.probabilitySemantics).toBe("CANDIDATE_RELATIVE");
    expect(answer.uncertainty?.confidenceSource).toBe("NONE");
  });

  it("fails closed when CLM is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connection refused")));
    const result = await new CLMDecisionAdapter({ baseUrl: "http://clm.test", timeoutMs: 100 }).evaluateBatch({
      batchId: "clm_04", questions: [{ id: "q", type: "NOUL", question: "Known?" }],
    });
    expect(result.status).toBe("UNRESOLVED");
    expect(result.shouldEscalate).toBe(true);
    expect(result.adapterMetadata?.isTrainingEligible).toBe(false);
  });
});