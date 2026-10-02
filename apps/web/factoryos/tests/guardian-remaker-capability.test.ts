import { describe, expect, it } from "vitest";
import { CapabilityRegistry } from "../core/cognitive/CapabilityRegistry";
import { GuardianReMakerCapabilityIssuer } from "../core/guardian/GuardianReMakerCapabilityIssuer";
import { LeaseManager } from "../core/leases/LeaseManager";
import { InMemoryLeaseRepository } from "../core/database/InMemoryDatabase";

describe("Guardian ReMaker capability admission", () => {
  it("registers CAP_REMAKER_REPAIR as production routable and training eligible", () => {
    const registry = new CapabilityRegistry();
    const meta = registry.get("CAP_REMAKER_REPAIR");
    expect(meta).toBeDefined();
    expect(meta?.implementationStatus).toBe("IMPLEMENTED");
    expect(meta?.isProductionRoutable).toBe(true);
    expect(meta?.trainingEligibility).toBe("ELIGIBLE");
    expect(
      registry.authorizeExecution("CAP_REMAKER_REPAIR", {
        role: "FLOOR_GUARDIAN",
        floorId: "floor06_rendering",
        environment: "production",
      }).authorized,
    ).toBe(true);
  });

  it("issues a Guardian grant backed by a lease and fencing token", async () => {
    const capability = new GuardianReMakerCapabilityIssuer(
      new CapabilityRegistry(),
      new LeaseManager(new InMemoryLeaseRepository()),
    );
    const grant = await capability.issue({
      floorId: "floor06_rendering",
      missionId: "mission_01",
      caseId: "case_01",
      repairId: "repair_01",
      requestedChangeDigest: "a".repeat(64),
      evidenceRefs: ["f07:ev:01"],
      holderId: "remaker:repair_01",
      ttlMs: 30_000,
      authorizedBy: "guardian_floor06_rendering",
    });
    expect(grant.capabilityId).toBe("CAP_REMAKER_REPAIR");
    expect(grant.fencingToken).toBeGreaterThan(0);
    expect(Date.parse(grant.expiresAt)).toBeGreaterThan(Date.now());
  });

  it("rejects non-F06 or non-Guardian issuance", async () => {
    const capability = new GuardianReMakerCapabilityIssuer(
      new CapabilityRegistry(),
      new LeaseManager(new InMemoryLeaseRepository()),
    );
    await expect(capability.issue({
      floorId: "floor05_timeline_composition",
      missionId: "mission_01",
      caseId: "case_01",
      repairId: "repair_bad_floor",
      requestedChangeDigest: "b".repeat(64),
      evidenceRefs: ["f07:ev:02"],
      holderId: "remaker:repair_bad_floor",
      ttlMs: 30_000,
      authorizedBy: "guardian_floor05_timeline_composition",
    })).rejects.toThrow(/restricted to Floor 06/);
    await expect(capability.issue({
      floorId: "floor06_rendering",
      missionId: "mission_01",
      caseId: "case_01",
      repairId: "repair_bad_issuer",
      requestedChangeDigest: "c".repeat(64),
      evidenceRefs: ["f07:ev:03"],
      holderId: "remaker:repair_bad_issuer",
      ttlMs: 30_000,
      authorizedBy: "overseer",
    })).rejects.toThrow(/floor Guardian/);
  });
});
