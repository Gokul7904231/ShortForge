import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { DurableEventBus } from "../core/events/DurableEventBus";
import { KnowledgeStore } from "../core/intelligence/knowledge/KnowledgeStore";
import { MemoryWriter } from "../core/intelligence/writer/MemoryWriter";
import { InMemoryMemoryFabricLedger } from "../core/intelligence/memory/MongoMemoryFabricLedger";
import { MemoryFabricBridge } from "../core/intelligence/memory/MemoryFabricBridge";

describe("Live Obsidian Memory Fabric", () => {
  const vault = path.resolve(process.cwd(), ".test-vault-live-memory-fabric");

  beforeEach(() => {
    if (fs.existsSync(vault)) fs.rmSync(vault, { recursive: true, force: true });
    fs.mkdirSync(vault, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(vault)) fs.rmSync(vault, { recursive: true, force: true });
  });

  it("ingests runtime evidence, sanitizes it, compiles candidates, and exposes bounded projections", async () => {
    const bus = new DurableEventBus();
    const store = new KnowledgeStore(vault);
    const writer = new MemoryWriter(store);
    const ledger = new InMemoryMemoryFabricLedger();

    const bridge = new MemoryFabricBridge(
      bus,
      store,
      writer,
      ledger,
      null,
      { enabled: true, vaultPath: vault, batchSize: 10 },
    );

    await bridge.start();

    await bus.publish(
      "MISSION_COMPLETED",
      {
        missionId: "mission-test-001",
        outcome: "completed",
        password: "do-not-store",
        authorization: "Bearer abcdefghijklmnopqrstuvwxyz0123456789",
      },
      {
        source: "test-runtime",
        correlationId: "corr-test-001",
        idempotencyKey: "mission-complete-test-001",
      },
    );

    await new Promise((resolve) => setTimeout(resolve, 25));

    const rawFiles = store.list().filter((doc) => doc.filePath.includes("obsidian/raw/runtime"));
    const candidateFiles = store.list().filter((doc) => doc.filePath.includes("obsidian/candidates"));

    expect(rawFiles.length).toBe(1);
    expect(candidateFiles.length).toBe(1);
    expect(rawFiles[0].content).not.toContain("do-not-store");
    expect(rawFiles[0].content).toContain("[REDACTED_SECRET]");
    expect(candidateFiles[0].frontmatter.sf_lifecycle).toBe("candidate");
    expect(candidateFiles[0].frontmatter.sf_verification_state).toBe("unverified");

    const health = await bridge.getHealth();
    expect(health.running).toBe(true);
    expect(health.mode).toBe("EVENT_ONLY");
    expect(health.totalIngested).toBe(1);

    const agentProjection = await bridge.projectForAgent("MISSION_COMPLETED");
    expect(agentProjection.itemCount).toBe(0);

    await store.update(candidateFiles[0].frontmatter.id, {
      frontmatter: {
        sf_verification_state: "verified",
        sf_epistemic_state: "sourced",
        verified: [
          {
            by: "test-auditor",
            at: new Date().toISOString(),
            method: "controlled-integration-test",
          },
        ],
        evidence_refs: ["evidence:test-001"],
      },
    });

    await bridge.drain();

    const promoted = store.get(candidateFiles[0].frontmatter.id);
    expect(promoted?.frontmatter.sf_lifecycle).toBe("active");
    expect(promoted?.frontmatter.sf_verification_state).toBe("verified");
    expect(promoted?.frontmatter.sf_quality_state).toBe("VALID");
    expect(promoted?.frontmatter.training_eligible).toBe(false);

    const projectedAgentMemory = await bridge.projectForAgent("MISSION_COMPLETED");
    expect(projectedAgentMemory.itemCount).toBe(1);

    const projectedAscalonBeforeAdmission = await bridge.projectForAscalon();
    expect(projectedAscalonBeforeAdmission.itemCount).toBe(0);

    await store.update(promoted!.frontmatter.id, {
      frontmatter: { training_eligible: true },
    });

    const projectedAscalon = await bridge.projectForAscalon();
    expect(projectedAscalon.itemCount).toBe(1);

    await bridge.stop();
  });

  it("enforces explicit promotion metadata for automatic promotion", async () => {
    const bus = new DurableEventBus();
    const store = new KnowledgeStore(vault);
    const writer = new MemoryWriter(store);
    const ledger = new InMemoryMemoryFabricLedger();

    const bridge = new MemoryFabricBridge(
      bus,
      store,
      writer,
      ledger,
      null,
      { enabled: true, vaultPath: vault },
    );

    await bridge.start();

    await bus.publish(
      "VERIFICATION_PASSED",
      {
        capability: "memory-fabric-candidate",
        memoryPromotion: {
          status: "VERIFIED",
          evidenceReference: "receipt:memory-fabric-test",
          verificationEvidence: {
            verificationLevel: "INTEGRATION_VERIFIED",
            result: "PASS",
          },
        },
      },
      { source: "verified-test" },
    );

    await new Promise((resolve) => setTimeout(resolve, 25));

    const promoted = store
      .list()
      .find((doc) => doc.frontmatter.sf_lifecycle === "active" && doc.frontmatter.sf_memory_record_key);

    expect(promoted).toBeDefined();
    expect(promoted?.frontmatter.sf_verification_state).toBe("verified");
    expect(promoted?.frontmatter.sf_quality_state).toBe("VALID");

    await bridge.stop();
  });
});
