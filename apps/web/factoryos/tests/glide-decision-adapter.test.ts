import { afterEach, describe, expect, it, vi } from "vitest";
import { GlideDecisionAdapter } from "../core/intelligence/decision/GlideDecisionAdapter";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const baseRequest = {
  batchId: "glide-test",
  questions: [
    {
      id: "worker",
      type: "CHOICE" as const,
      question: "Which eligible worker should render this job fastest and reliably?",
      options: ["daytona", "runpod", "vast"] as const,
    },
    {
      id: "ready",
      type: "NOUL" as const,
      question: "Is the selected worker likely to finish before the deadline?",
    },
    {
      id: "risk",
      type: "SCORE" as const,
      question: "How risky is selecting this worker?",
      rubric: [
        { level: 10, label: "LOW", description: "Low operational risk" },
        { level: 20, label: "MEDIUM", description: "Medium operational risk" },
        { level: 30, label: "HIGH", description: "High operational risk" },
      ],
    },
  ],
  sharedContext: {
    job: {
      workloadType: "RENDER",
      requiredGpu: true,
      minVramGb: 24,
      deadlineSeconds: 60,
    },
    candidates: {
      daytona: { free: true, gpu: "RTX 5090", vramGb: 32, etaSeconds: 38, successRate: 0.98 },
      runpod: { free: true, gpu: "RTX 4090", vramGb: 24, etaSeconds: 45, successRate: 0.96 },
      vast: { free: false, gpu: "RTX 5090", vramGb: 32, etaSeconds: 70, successRate: 0.91 },
    },
  },
};

describe("GLiDE Decision Adapter", () => {
  it("is disabled by default and remains non-authoritative", async () => {
    const result = await new GlideDecisionAdapter({
      apiKey: "test-key",
      baseUrl: "https://api.fastino.ai",
    }).evaluateBatch(baseRequest);

    expect(result.adapterUsed).toBe("GLIDE_SHADOW");
    expect(result.status).toBe("UNRESOLVED");
    expect(result.adapterMetadata?.isProductionAuthority).toBe(false);
    expect(result.adapterMetadata?.isTrainingEligible).toBe(false);
    expect(result.adapterMetadata?.capabilityClass).toBe("FAST_DECISION");
  });

  it("sends the documented GLiDE HTTP shape with X-API-Key and parses typed choices", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        model: "glide",
        answers: {
          worker: {
            type: "choice",
            choice: "daytona",
            confidence: 0.4,
            probabilities: { daytona: 0.65, runpod: 0.1, vast: 0.25 },
          },
          ready: {
            type: "noul",
            noul: 0.93,
            confidence: 0.86,
          },
          risk: {
            type: "score",
            score: 0,
            expected_level: 0.35,
            confidence: 0.4,
            probabilities: { "0": 0.6, "1": 0.2, "2": 0.2 },
            legend: {
              "0": "Low operational risk",
              "1": "Medium operational risk",
              "2": "High operational risk",
            },
          },
        },
      }),
      text: async () => "",
    });

    vi.stubGlobal("fetch", fetchMock);

    const result = await new GlideDecisionAdapter({
      enabled: true,
      apiKey: "secret-value",
      baseUrl: "https://api.fastino.ai",
      allowedOrigins: ["https://api.fastino.ai"],
      maxRetries: 0,
    }).evaluateBatch(baseRequest);

    expect(result.status).toBe("VALID");
    expect(result.adapterUsed).toBe("GLIDE_SHADOW");
    expect(result.adapterMetadata?.modelRef).toBe("fastino/GLiDE");

    const call = fetchMock.mock.calls[0];
    expect(call[0]).toBe("https://api.fastino.ai/v1/systemone");
    expect(call[1].headers["X-API-Key"]).toBe("secret-value");

    const body = JSON.parse(call[1].body);
    expect(body.model).toBe("fastino/GLiDE");
    expect(body.questions.worker.type).toBe("choice");
    expect(body.questions.worker.criteria).toEqual({
      daytona: "daytona",
      runpod: "runpod",
      vast: "vast",
    });

    const worker = result.answersById.worker;
    expect(worker.type).toBe("CHOICE");
    if (worker.type === "CHOICE") {
      expect(worker.selected).toBe("daytona");
      expect(worker.confidence).toBeCloseTo(0.4, 5);
      expect(worker.uncertainty?.probabilitySemantics).toBe("CANDIDATE_RELATIVE");
    }

    const ready = result.answersById.ready;
    expect(ready.type).toBe("NOUL");
    if (ready.type === "NOUL") {
      expect(ready.confidence).toBeCloseTo(0.86, 5);
    }

    const risk = result.answersById.risk;
    expect(risk.type).toBe("SCORE");
    if (risk.type === "SCORE") {
      expect(risk.selectedLevel).toBe(10);
      expect(risk.selectedLabel).toBe("LOW");
      expect(risk.score).toBeCloseTo(0.175, 5);
    }
  });

  it("maps GLiDE Score indexes instead of treating score as TypeSafe weighted score", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        answers: {
          worker: {
            type: "score",
            score: 2,
            expected_level: 1.6,
            confidence: 0.7,
            probabilities: { "0": 0.1, "1": 0.1, "2": 0.8 },
          },
        },
      }),
      text: async () => "",
    }));

    const scoreRequest = {
      ...baseRequest,
      questions: [baseRequest.questions[2]],
    };

    const result = await new GlideDecisionAdapter({
      enabled: true,
      apiKey: "test-key",
      maxRetries: 0,
    }).evaluateBatch(scoreRequest);

    const answer = result.answersById.risk;
    expect(answer.type).toBe("SCORE");
    if (answer.type === "SCORE") {
      expect(answer.selectedLevel).toBe(30);
      expect(answer.score).toBeCloseTo(0.8, 5);
      expect(answer.confidence).toBeCloseTo(0.7, 5);
    }
  });

  it("fails closed for undeclared choices and malformed distributions", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        answers: {
          worker: {
            type: "choice",
            choice: "unknown-worker",
            confidence: 0.99,
            probabilities: { daytona: 0.5, runpod: 0.5, vast: 0 },
          },
        },
      }),
      text: async () => "",
    }));

    const result = await new GlideDecisionAdapter({
      enabled: true,
      apiKey: "test-key",
      maxRetries: 0,
    }).evaluateBatch({
      ...baseRequest,
      questions: [baseRequest.questions[0]],
    });

    expect(result.status).toBe("UNRESOLVED");
    expect(result.answers[0].status).toBe("INVALID");
    expect(result.answers[0].validationErrorCode).toBe("INVALID_ENUM");
  });

  it("retries 425/429/503 with bounded retries and then succeeds", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: new Headers(),
        text: async () => "rate limited",
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          answers: {
            worker: {
              type: "choice",
              choice: "daytona",
              confidence: 0.8,
              probabilities: { daytona: 0.85, runpod: 0.1, vast: 0.05 },
            },
          },
        }),
        text: async () => "",
      });

    vi.stubGlobal("fetch", fetchMock);

    const result = await new GlideDecisionAdapter({
      enabled: true,
      apiKey: "test-key",
      retryDelayMs: 0,
      maxRetries: 1,
    }).evaluateBatch({
      ...baseRequest,
      questions: [baseRequest.questions[0]],
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.status).toBe("VALID");
    expect(result.answersById.worker.type).toBe("CHOICE");
  });

  it("does not retry authentication/validation failures", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers(),
      text: async () => "bad key",
    });

    vi.stubGlobal("fetch", fetchMock);

    const result = await new GlideDecisionAdapter({
      enabled: true,
      apiKey: "test-key",
      retryDelayMs: 0,
      maxRetries: 3,
    }).evaluateBatch({
      ...baseRequest,
      questions: [baseRequest.questions[0]],
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("UNRESOLVED");
    expect(result.answers[0].validationErrorCode).toBe("AUTHENTICATION_FAILED");
  });

  it("fails closed when the provider does not respond before the ShortForge decision budget", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => new Promise(() => undefined)));

    const result = await new GlideDecisionAdapter({
      enabled: true,
      apiKey: "test-key",
      timeoutMs: 250,
      maxRetries: 0,
    }).evaluateBatch({
      ...baseRequest,
      questions: [baseRequest.questions[0]],
    });

    expect(result.status).toBe("UNRESOLVED");
    expect(result.shouldEscalate).toBe(true);
    expect(result.answers[0].validationErrorCode).toBe("ADAPTER_TIMEOUT");
  });

  it("requires material state before sending a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await new GlideDecisionAdapter({
      enabled: true,
      apiKey: "test-key",
      maxRetries: 0,
    }).evaluateBatch({
      ...baseRequest,
      sharedContext: {},
      questions: [baseRequest.questions[0]],
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.answers[0].validationErrorCode).toBe("MISSING_FIELD");
  });
});
