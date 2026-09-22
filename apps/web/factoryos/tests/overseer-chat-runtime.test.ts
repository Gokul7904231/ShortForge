/**
 * FactoryOS Frontier v3 — Overseer Chat Runtime Regression & Acceptance Test Suite
 * Validates that the Overseer Chat Response Pipeline performs real conversational inference,
 * separates internal router state from user-facing answers, eliminates canned acknowledgments,
 * and handles error states fail-closed.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { POST as interactHandler } from "../../app/api/overseer/presence/interact/route";
import { OverseerCognitivePipeline } from "../core/cognition/OverseerCognitivePipeline";
import { OverseerCognitionClient } from "../core/cognition/OverseerCognitionClient";
import { FactoryStateService } from "../core/state/FactoryStateService";

describe("FactoryOS Frontier v3 — Overseer Chat Runtime Acceptance Suite", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.SIMULATE_LLM_FAILURE;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  // =========================================================================
  // 1. EXACT REGRESSION TEST (Screenshot Bug Falsification)
  // =========================================================================
  it("REGRESSION: 'who r you?' produces semantic identity answer and NOT a canned router acknowledgment", async () => {
    const req = new NextRequest("http://localhost:3000/api/overseer/presence/interact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "who r you?",
        mode: "CHAT",
        context: "factory",
      }),
    });

    const res = await interactHandler(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);

    const { answer, evidence } = json.data;

    // Invariant 1: Answer must NOT be empty
    expect(answer).toBeDefined();
    expect(typeof answer).toBe("string");
    expect(answer.trim().length).toBeGreaterThan(10);

    // Invariant 2: Answer must NOT be the user input echoed back
    expect(answer.trim()).not.toBe("who r you?");

    // Invariant 3: FORBIDDEN canned router acknowledgment
    expect(answer).not.toContain("Understood:");
    expect(answer).not.toContain("Mode is set to");
    expect(answer).not.toContain("Telemetry across all 4 production floors");
    expect(answer).not.toContain("agent swarms are standing by");

    // Invariant 4: Semantically explains Overseer identity
    expect(/overseer/i.test(answer)).toBe(true);

    // Invariant 5: Router metadata is strictly isolated into evidence array
    expect(evidence).toBeDefined();
    expect(evidence.some((e: string) => e.includes("Operational Mode: CHAT"))).toBe(true);
  });

  // =========================================================================
  // 2. CORE QUESTIONS MANDATED BY CHARTER
  // =========================================================================

  it("TEST 1: 'who r you?' semantically answers identity question", async () => {
    const pipeline = new OverseerCognitivePipeline();
    const result = await pipeline.processUserQuery("who r you?", {
      userId: "test_operator",
      userRole: "ADMIN",
    });

    expect(result.success).not.toBe(false);
    expect(result.answer.length).toBeGreaterThan(15);
    expect(/overseer/i.test(result.answer)).toBe(true);
    expect(result.answer).not.toContain("Understood:");
  });

  it("TEST 2: 'what can you do?' describes Overseer capabilities", async () => {
    const pipeline = new OverseerCognitivePipeline();
    const result = await pipeline.processUserQuery("what can you do?", {
      userId: "test_operator",
      userRole: "ADMIN",
    });

    expect(result.success).not.toBe(false);
    expect(/supervise|telemetry|video|mission|production|floor/i.test(result.answer)).toBe(true);
    expect(result.answer).not.toContain("Understood:");
  });

  it("TEST 3: 'hello' returns normal conversational greeting", async () => {
    const pipeline = new OverseerCognitivePipeline();
    const result = await pipeline.processUserQuery("hello", {
      userId: "test_operator",
      userRole: "ADMIN",
    });

    expect(result.success).not.toBe(false);
    expect(/hello|hey|welcome|overseer/i.test(result.answer)).toBe(true);
    expect(result.answer).not.toContain("Understood:");
  });

  it("TEST 4: 'what is FactoryOS?' explains the FactoryOS platform naturally", async () => {
    const pipeline = new OverseerCognitivePipeline();
    const result = await pipeline.processUserQuery("what is FactoryOS?", {
      userId: "test_operator",
      userRole: "ADMIN",
    });

    expect(result.success).not.toBe(false);
    expect(/factoryos|operating system|shortforge|pipeline|production/i.test(result.answer)).toBe(true);
    expect(result.answer).not.toContain("Understood:");
  });

  it("TEST 5: 'what is the current factory status?' retrieves actual runtime state without inventing status", async () => {
    const telemetry = await FactoryStateService.getInstance().getLiveFactoryTelemetry();
    expect(telemetry.data.floorCount).toBeGreaterThan(0);

    const pipeline = new OverseerCognitivePipeline();
    const result = await pipeline.processUserQuery("what is the current factory status?", {
      userId: "test_operator",
      userRole: "ADMIN",
    });

    expect(result.success).not.toBe(false);
    expect(/factory status|production floors|healthy|operational/i.test(result.answer)).toBe(true);
    expect(result.answer).not.toContain("Understood:");
  });

  // =========================================================================
  // 3. ERROR PATHS & FAIL-CLOSED INTEGRITY (SECTION 20)
  // =========================================================================

  it("ERROR PATH A: LLM available -> real assistant response generated with diagnostics", async () => {
    const client = new OverseerCognitionClient();
    const res = await client.executeRequest({
      operation: "SYNTHESIZE",
      systemPrompt: "You are the FactoryOS Overseer.",
      userPrompt: JSON.stringify({ userQuestion: "who r you?" }),
    });

    expect(res.success).toBe(true);
    expect(res.diagnostics).toBeDefined();
    expect(res.diagnostics?.chatRequestStarted).toBeDefined();
    expect(res.diagnostics?.chatRequestId).toMatch(/^chat_/);
    expect(res.diagnostics?.responseParsed).toBe(true);
    expect(res.data.answer).toBeDefined();
  });

  it("ERROR PATH B: LLM timeout -> explicit timeout error, never generic router message", async () => {
    process.env.SIMULATE_LLM_FAILURE = "TIMEOUT";

    const req = new NextRequest("http://localhost:3000/api/overseer/presence/interact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "who r you?",
        mode: "CHAT",
      }),
    });

    const res = await interactHandler(req);
    expect(res.status).toBe(503);

    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.errorCode).toBe("TIMEOUT");
    expect(json.error).toContain("timed out");
  });

  it("ERROR PATH C: LLM unavailable -> explicit provider unavailable error, never disguised as success", async () => {
    process.env.SIMULATE_LLM_FAILURE = "PROVIDER_UNAVAILABLE";

    const req = new NextRequest("http://localhost:3000/api/overseer/presence/interact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "who r you?",
        mode: "CHAT",
      }),
    });

    const res = await interactHandler(req);
    expect(res.status).toBe(503);

    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.errorCode).toBe("PROVIDER_UNAVAILABLE");
    expect(json.error).toContain("unable to reach its reasoning service");
  });

  it("ERROR PATH D: Bad request (missing or empty message) -> HTTP 400 validation error", async () => {
    const req = new NextRequest("http://localhost:3000/api/overseer/presence/interact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "   " }),
    });

    const res = await interactHandler(req);
    expect(res.status).toBe(400);

    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.error).toContain("Missing required parameter: message");
  });

  it("ERROR PATH E: Authentication missing when required -> HTTP 401 auth failure", async () => {
    const req = new NextRequest("http://localhost:3000/api/overseer/presence/interact", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-require-auth": "true",
      },
      body: JSON.stringify({ message: "who r you?" }),
    });

    const res = await interactHandler(req);
    expect(res.status).toBe(401);

    const json = await res.json();
    expect(json.success).toBe(false);
    expect(json.code).toBe("UNAUTHORIZED");
  });
});
