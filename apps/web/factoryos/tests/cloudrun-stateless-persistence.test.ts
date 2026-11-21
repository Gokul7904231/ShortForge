/**
 * Tests for Cloud Run Stateless Persistence Layer:
 * - Next.js standalone output configuration verification
 * - InstaBoxFleetRegistry Firestore adapter & fail-closed production gate
 * - ContentAddressedStore GCS & B2 cloud backend adapters with bounded cache retention
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import {
  InstaBoxFleetRegistry,
  InstaBoxPersistenceError,
} from "../core/compute/instabox/InstaBoxFleetRegistry";
import {
  ContentAddressedStore,
  GcsCasBackend,
  B2CasBackend,
  type CasCloudBackend,
} from "../core/compute/cas/ContentAddressedStore";

describe("Cloud Run Stateless Persistence & Fleet Layer", () => {
  const originalEnv = { ...process.env };
  const tempTestDir = path.resolve(process.cwd(), "data", "test_stateless_persistence");

  beforeEach(() => {
    if (fs.existsSync(tempTestDir)) {
      fs.rmSync(tempTestDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tempTestDir, { recursive: true });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    if (fs.existsSync(tempTestDir)) {
      fs.rmSync(tempTestDir, { recursive: true, force: true });
    }
  });

  describe("1. Next.js Standalone Build Config Verification", () => {
    it("ensures next.config.mjs specifies output: standalone for container deployment", async () => {
      const configPath = fs.existsSync(path.resolve(process.cwd(), "next.config.mjs"))
        ? path.resolve(process.cwd(), "next.config.mjs")
        : path.resolve(process.cwd(), "apps", "web", "next.config.mjs");
      expect(fs.existsSync(configPath)).toBe(true);
      const content = fs.readFileSync(configPath, "utf8");
      expect(content).toContain('output: "standalone"');
    });
  });

  describe("2. InstaBoxFleetRegistry Production Fail-Closed Gate", () => {
    it("throws InstaBoxPersistenceError in production when Firestore credentials are unset", () => {
      process.env.NODE_ENV = "production";
      delete process.env.FIREBASE_PROJECT_ID;
      delete process.env.FIREBASE_CLIENT_EMAIL;
      delete process.env.FIREBASE_PRIVATE_KEY;
      delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
      delete process.env.GOOGLE_CLOUD_PROJECT;
      delete process.env.K_SERVICE;

      expect(() => {
        InstaBoxFleetRegistry.resetInstanceForTesting(path.join(tempTestDir, "test_fleet.json"));
      }).toThrowError(InstaBoxPersistenceError);
    });

    it("initializes cleanly in production when Firestore credentials are present", () => {
      process.env.NODE_ENV = "production";
      process.env.FIREBASE_PROJECT_ID = "mock-shortforge-production";
      process.env.FIREBASE_CLIENT_EMAIL = "sa@mock-shortforge.iam.gserviceaccount.com";
      process.env.FIREBASE_PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\nMOCK\n-----END PRIVATE KEY-----";

      expect(() => {
        const reg = InstaBoxFleetRegistry.resetInstanceForTesting(path.join(tempTestDir, "test_fleet.json"));
        expect(reg).toBeDefined();
      }).not.toThrow();
    });

    it("falls back to local JSON state in development/test without throwing", () => {
      process.env.NODE_ENV = "development";
      delete process.env.FIREBASE_PROJECT_ID;

      const reg = InstaBoxFleetRegistry.resetInstanceForTesting(path.join(tempTestDir, "local_fleet.json"));
      expect(reg).toBeDefined();
      expect(reg.getAllNodeIds().length).toBe(11);
    });
  });

  describe("3. InstaBoxFleetRegistry Firestore Persistence Adapter", () => {
    it("serializes and persists fleet state to Firestore instabox_fleet_state collection", async () => {
      process.env.NODE_ENV = "test";
      const reg = InstaBoxFleetRegistry.resetInstanceForTesting(path.join(tempTestDir, "fleet_state.json"));

      // Record a heartbeat on box2
      reg.recordHeartbeat({
        nodeId: "box2",
        workerId: "instabox-box2",
        status: "HEALTHY",
        metrics: {
          cpuCores: 4,
          cpuUsagePercent: 12.5,
          memoryTotalMb: 8192,
          memoryAvailableMb: 6144,
          diskTotalMb: 20480,
          diskAvailableMb: 15360,
          loadAverage1m: 0.15,
          operatingSystem: "Linux 6.18",
          activeJobs: 0,
        },
      });

      const persisted = await reg.persistStateToFirestore();
      expect(persisted).toBe(true);

      // Reset in-memory state and reload from Firestore
      const reg2 = InstaBoxFleetRegistry.resetInstanceForTesting(path.join(tempTestDir, "fresh_fleet.json"));
      const restored = await reg2.loadPersistedStateFromFirestore();
      expect(restored).toBe(true);

      const box2Record = reg2.getNodeRecord("box2");
      expect(box2Record).toBeDefined();
      expect(box2Record?.metrics?.cpuUsagePercent).toBe(12.5);
      expect(box2Record?.lastHeartbeatAt).toBeDefined();
    });
  });

  describe("4. ContentAddressedStore GCS Backend Adapter", () => {
    it("uploads artifact via streaming GCS adapter and validates physical SHA-256", async () => {
      const cas = ContentAddressedStore.resetInstanceForTesting(path.join(tempTestDir, "cas_store"));
      const gcsBackend = new GcsCasBackend("shortforge-cas-bucket");
      cas.setCloudBackend(gcsBackend);

      // Create a test media file
      const sourceFile = path.join(tempTestDir, "test_render.mp4");
      const sampleContent = Buffer.from("SHORTFORGE_MOCK_MP4_FRAME_DATA_" + Date.now());
      fs.writeFileSync(sourceFile, sampleContent);
      const expectedSha = crypto.createHash("sha256").update(sampleContent).digest("hex");

      const ref = await cas.putFile(sourceFile, "output_mp4", "video/mp4");
      expect(ref.sha256).toBe(expectedSha);
      expect(ref.metadata?.cloudUri).toContain("gs://shortforge-cas-bucket/");
      expect(ref.metadata?.cloudBackend).toBe("gcs");

      // Verify physical integrity
      const verification = await cas.verifyArtifactIntegrity(ref);
      expect(verification.valid).toBe(true);
      expect(verification.actualSha256).toBe(expectedSha);
    });
  });

  describe("5. ContentAddressedStore Backblaze B2 Backend Adapter", () => {
    it("uploads and downloads artifact through B2 adapter without data corruption", async () => {
      const cas = ContentAddressedStore.resetInstanceForTesting(path.join(tempTestDir, "cas_b2_store"));
      const b2Backend = new B2CasBackend("shortforge-b2-bucket");
      cas.setCloudBackend(b2Backend);

      const sourceFile = path.join(tempTestDir, "b2_sample.mp4");
      const sampleBytes = Buffer.from("SHORTFORGE_B2_VIDEO_BYTES_" + Math.random());
      fs.writeFileSync(sourceFile, sampleBytes);
      const expectedSha = crypto.createHash("sha256").update(sampleBytes).digest("hex");

      const ref = await cas.putFile(sourceFile, "output_mp4", "video/mp4");
      expect(ref.sha256).toBe(expectedSha);
      expect(ref.metadata?.cloudUri).toContain("b2://shortforge-b2-bucket/");
      expect(ref.metadata?.cloudBackend).toBe("b2");

      // Test ensureLocalFile re-fetching from B2 backend
      // Simulate local file deletion
      if (ref.uri && fs.existsSync(ref.uri)) {
        fs.unlinkSync(ref.uri);
      }
      expect(fs.existsSync(ref.uri!)).toBe(false);

      const restoredPath = await cas.ensureLocalFile(expectedSha);
      expect(fs.existsSync(restoredPath)).toBe(true);
      const restoredSha = await ContentAddressedStore.computeFileSha256(restoredPath);
      expect(restoredSha).toBe(expectedSha);
    });
  });

  describe("6. ContentAddressedStore Bounded Cache Retention", () => {
    it("prunes cached local files that have cloud backups when cache is under pressure", async () => {
      const cas = ContentAddressedStore.resetInstanceForTesting(path.join(tempTestDir, "cas_bounded"));
      const mockBackend: CasCloudBackend = {
        backendType: "gcs",
        uploadArtifact: async (key, localPath) => `gs://mock-bucket/${key}`,
        downloadArtifact: async () => true,
        exists: async () => true,
      };
      cas.setCloudBackend(mockBackend);

      // Create 3 artifacts
      const shas: string[] = [];
      for (let i = 0; i < 3; i++) {
        const p = path.join(tempTestDir, `artifact_${i}.bin`);
        fs.writeFileSync(p, Buffer.alloc(1024, i));
        const ref = await cas.putFile(p, "data");
        shas.push(ref.sha256);
      }

      const initialSize = cas.getCacheSizeBytes();
      expect(initialSize).toBeGreaterThanOrEqual(3072);

      // Prune at least 2048 bytes
      const freed = await cas.pruneLocalCache(2048);
      expect(freed).toBeGreaterThanOrEqual(2048);
      expect(cas.getCacheSizeBytes()).toBeLessThan(initialSize);
    });
  });
});
