import { describe, it, expect } from "vitest";
import { EvidenceFactory, EvidenceRecord } from "../core/contracts/EvidenceRecord";
import { FactoryStateService } from "../core/state/FactoryStateService";
import { TrendResearchService } from "../core/research/TrendResearchService";
import { KnowledgeDocumentService } from "../core/rag/KnowledgeDocumentService";
import { MissionStateService } from "../core/missions/MissionStateService";

describe("FactoryOS — Zero-Placeholder Evidence Contract Suite", () => {
  it("01: FactoryStateService produces valid TELEMETRY EvidenceRecord with real CPU/memory", async () => {
    const service = FactoryStateService.getInstance();
    const ev = await service.getLiveFactoryTelemetry();

    expect(ev).toBeDefined();
    expect(ev.type).toBe("TELEMETRY");
    expect(ev.source).toBe("FactoryStateService");
    expect(ev.state).toBe("SUCCESS");
    expect(ev.data.floorCount).toBe(7);
    expect(ev.data.systemLoad.cpuUsagePct).toBeGreaterThanOrEqual(0);
    expect(ev.data.systemLoad.totalMemBytes).toBeGreaterThan(0);
    expect(ev.claims).toBeDefined();
    expect(ev.claims?.length).toBeGreaterThan(0);
  });

  it("02: TrendResearchService produces live research or truthful UNAVAILABLE state", async () => {
    const service = TrendResearchService.getInstance();
    const ev = await service.conductLiveResearch();

    expect(ev).toBeDefined();
    expect(ev.type).toBe("WEB_RESEARCH");
    expect(["SUCCESS", "UNAVAILABLE", "ERROR"]).toContain(ev.state);
    if (ev.state === "UNAVAILABLE") {
      expect(ev.error).toBeDefined();
      expect(ev.data).toBeNull();
    }
  });

  it("03: KnowledgeDocumentService distinguishes EMPTY from UNAVAILABLE", async () => {
    const service = KnowledgeDocumentService.getInstance();
    const ev = await service.lookupDocument("non_existent_document_xyz_999");

    expect(ev).toBeDefined();
    expect(ev.type).toBe("DOCUMENT");
    expect(ev.state).toBe("EMPTY");
    expect(ev.data).toBeNull();
    expect(ev.error).toContain("No .okf or workspace document");
  });

  it("04: MissionStateService scopes video status to authenticated user", async () => {
    const service = MissionStateService.getInstance();
    const ev = await service.getUserMissionStatus("user_live_test_123");

    expect(ev).toBeDefined();
    expect(ev.type).toBe("MISSION");
    expect(["SUCCESS", "EMPTY"]).toContain(ev.state);
    expect(ev.data.userId).toBe("user_live_test_123");
    expect(typeof ev.data.activeMissionsCount).toBe("number");
    expect(typeof ev.data.completedVideosCount).toBe("number");
  });
});
