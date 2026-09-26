import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DurableEventBus } from "../core/events/DurableEventBus";
import { KnowledgeStore } from "../core/intelligence/knowledge/KnowledgeStore";
import { MemoryWriter } from "../core/intelligence/writer/MemoryWriter";
import { InMemoryMemoryFabricLedger } from "../core/intelligence/memory/MongoMemoryFabricLedger";
import { MemoryFabricBridge } from "../core/intelligence/memory/MemoryFabricBridge";

const vault = path.resolve(process.cwd(), ".test-vault-live-memory-fabric");

function resetVault(): void {
  if (fs.existsSync(vault)) fs.rmSync(vault, { recursive: true, force: true });
  fs.mkdirSync(vault, { recursive: true });
}

async function testLiveIngestion(): Promise<void> {
  resetVault();

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

  assert.equal(rawFiles.length, 1);
  assert.equal(candidateFiles.length, 1);
  assert.doesNotMatch(rawFiles[0].content, /do-not-store/);
  assert.match(rawFiles[0].content, /REDACTED_SECRET/);
  assert.equal(candidateFiles[0].frontmatter.sf_lifecycle, "candidate");
  assert.equal(candidateFiles[0].frontmatter.sf_verification_state, "unverified");

  const health = await bridge.getHealth();
  assert.equal(health.running, true);
  assert.equal(health.mode, "EVENT_ONLY");
  assert.equal(health.totalIngested, 1);

  const agentProjection = await bridge.projectForAgent("MISSION_COMPLETED");
  assert.equal(agentProjection.itemCount, 0);

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
  assert.ok(promoted);
  assert.equal(promoted.frontmatter.sf_lifecycle, "active");
  assert.equal(promoted.frontmatter.sf_verification_state, "verified");
  assert.equal(promoted.frontmatter.sf_quality_state, "VALID");
  assert.equal(promoted.frontmatter.training_eligible, false);

  const projectedAgentMemory = await bridge.projectForAgent("MISSION_COMPLETED");
  assert.equal(projectedAgentMemory.itemCount, 1);

  const projectedAscalonBeforeAdmission = await bridge.projectForAscalon();
  assert.equal(projectedAscalonBeforeAdmission.itemCount, 0);

  await store.update(promoted.frontmatter.id, {
    frontmatter: { training_eligible: true },
  });

  const projectedAscalon = await bridge.projectForAscalon();
  assert.equal(projectedAscalon.itemCount, 1);

  await bridge.stop();
}

async function testExplicitPromotion(): Promise<void> {
  resetVault();

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

  assert.ok(promoted);
  assert.equal(promoted.frontmatter.sf_verification_state, "verified");
  assert.equal(promoted.frontmatter.sf_quality_state, "VALID");

  await bridge.stop();
}

async function main(): Promise<void> {
  try {
    await testLiveIngestion();
    await testExplicitPromotion();
    resetVault();
    console.log("LIVE_MEMORY_FABRIC: PASS");
  } catch (error) {
    resetVault();
    console.error("LIVE_MEMORY_FABRIC: FAIL");
    console.error(error);
    process.exit(1);
  }
}

void main();
