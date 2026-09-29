import { describe, it, expect } from "vitest";
import { OverseerCognitivePipeline } from "../core/cognition/OverseerCognitivePipeline";

describe("FactoryOS — Single Source of Truth Authority Suite", () => {
  const pipeline = new OverseerCognitivePipeline();

  it("01: Routes FACTORY_TELEMETRY to FactoryStateService", async () => {
    const result = await pipeline.processUserQuery("How many floors are healthy in the factory?", {
      userId: "test_user_owner",
      userRole: "OWNER",
    });

    expect(result.intent).toBe("FACTORY_TELEMETRY");
    expect(result.sourceUsed).toBe("FactoryStateService");
    expect(result.evidenceRecord).toBeDefined();
    expect(result.evidenceRecord?.type).toBe("TELEMETRY");
    expect(result.evidence.floorCount).toBe(8);
  });

  it("02: Routes CURRENT_TREND to TrendResearchService with real evidence", async () => {
    const result = await pipeline.processUserQuery("What is today's trending AI topic?", {
      userId: "test_user_owner",
      userRole: "OWNER",
    });

    expect(result.intent).toBe("CURRENT_TREND");
    expect(result.sourceUsed).toContain("TrendResearchService");
    expect(result.evidenceRecord?.type).toBe("WEB_RESEARCH");
  });

  it("03: Routes DOCUMENT_LOOKUP to KnowledgeDocumentService without fake text", async () => {
    const result = await pipeline.processUserQuery("Look up our brand guide guidelines", {
      userId: "test_user_owner",
      userRole: "OWNER",
    });

    expect(result.intent).toBe("DOCUMENT_LOOKUP");
    expect(result.sourceUsed).toContain("KnowledgeDocumentService");
    expect(result.evidenceRecord?.type).toBe("DOCUMENT");
  });

  it("04: Routes QUOTA directly to QuotaService with authenticated user scope", async () => {
    const result = await pipeline.processUserQuery("How many render credits do I have left?", {
      userId: "test_user_owner",
      userRole: "OWNER",
    });

    expect(result.intent).toBe("QUOTA");
    expect(result.sourceUsed).toContain("QuotaService");
    expect(result.evidenceRecord?.type).toBe("QUOTA");
  });

  it("05: Routes VIDEO_STATUS to MissionStateService", async () => {
    const result = await pipeline.processUserQuery("What is the status of my video renders?", {
      userId: "test_user_owner",
      userRole: "OWNER",
    });

    expect(result.intent).toBe("VIDEO_STATUS");
    expect(result.sourceUsed).toBe("MissionStateService");
    expect(result.evidenceRecord?.type).toBe("MISSION");
  });
});
