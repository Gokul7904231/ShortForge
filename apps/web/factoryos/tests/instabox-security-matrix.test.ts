import { describe, expect, it, beforeEach, afterEach } from "vitest";
import * as crypto from "node:crypto";
import { InstaBoxFleetRegistry } from "../core/compute/instabox/InstaBoxFleetRegistry";
import {
  INSTABOX_WORKER_NODE_IDS,
  INSTABOX_EXCLUDED_NODES,
} from "../core/compute/instabox/InstaBoxContracts";

describe("InstaBox Security & Worker Identity Matrix", () => {
  const originalEnv = { ...process.env };
  const ADMIN_SECRET = "admin-secret-super-secure-key-2026";
  const WORKER_SECRET = "worker-general-secret-key-32chars";
  const BOX2_SECRET = "box2-specific-secret-key-32chars";

  let registry: InstaBoxFleetRegistry;

  beforeEach(() => {
    // Clean up environment variables
    for (const key of Object.keys(process.env)) {
      if (key.startsWith("INSTABOX_") || key === "INTERNAL_API_SECRET_KEY") {
        delete process.env[key];
      }
    }
    process.env.INSTABOX_CONTROL_PLANE_ADMIN_SECRET = ADMIN_SECRET;
    process.env.INSTABOX_WORKER_SECRET = WORKER_SECRET;
    process.env.INSTABOX_WORKER_SECRET_BOX2 = BOX2_SECRET;

    registry = InstaBoxFleetRegistry.resetInstanceForTesting();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("Admin vs. Worker Secret Segregation", () => {
    it("authenticates valid admin secret via authenticateControlPlaneAdmin", () => {
      expect(registry.authenticateControlPlaneAdmin(ADMIN_SECRET)).toBe(true);
      expect(registry.authenticateControlPlaneAdmin(` ${ADMIN_SECRET} `)).toBe(true);
    });

    it("rejects worker secret attempting admin authentication", () => {
      expect(registry.authenticateControlPlaneAdmin(WORKER_SECRET)).toBe(false);
      expect(registry.authenticateControlPlaneAdmin(BOX2_SECRET)).toBe(false);
      expect(registry.authenticateControlPlaneAdmin("random-invalid-token")).toBe(false);
      expect(registry.authenticateControlPlaneAdmin("")).toBe(false);
    });

    it("rejects admin secret attempting worker authentication", () => {
      expect(registry.authenticateWorker(ADMIN_SECRET, "instabox-box2")).toBe(false);
      expect(registry.authenticateWorker(ADMIN_SECRET, "instabox-box3")).toBe(false);
    });
  });

  describe("Strict Worker Identity Verification", () => {
    it("strictly requires workerId for worker authentication", () => {
      expect(registry.authenticateWorker(WORKER_SECRET)).toBe(false);
      expect(registry.authenticateWorker(WORKER_SECRET, "")).toBe(false);
      expect(registry.authenticateWorker(BOX2_SECRET)).toBe(false);
    });

    it("enforces node-specific credentials and rejects generic worker secret across all nodes", () => {
      // box2 has BOX2_SECRET configured
      expect(registry.authenticateWorker(BOX2_SECRET, "instabox-box2")).toBe(true);
      expect(registry.authenticateWorker(BOX2_SECRET, "box2")).toBe(true);

      // box2 strictly rejects the general worker secret
      expect(registry.authenticateWorker(WORKER_SECRET, "instabox-box2")).toBe(false);

      // box3 does not have specific secret: MUST REJECT general worker secret (fail closed)
      expect(registry.authenticateWorker(WORKER_SECRET, "instabox-box3")).toBe(false);
      expect(registry.authenticateWorker(BOX2_SECRET, "instabox-box3")).toBe(false);

      // Every worker node without an individual secret strictly rejects the shared generic secret
      for (const nodeId of INSTABOX_WORKER_NODE_IDS) {
        if (nodeId !== "box2") {
          expect(registry.authenticateWorker(WORKER_SECRET, `instabox-${nodeId}`)).toBe(false);
          expect(registry.authenticateWorker(WORKER_SECRET, nodeId)).toBe(false);
        }
      }
    });

    it("permanently rejects excluded node box9", () => {
      expect(registry.authenticateWorker(WORKER_SECRET, "instabox-box9")).toBe(false);
      expect(registry.authenticateWorker(WORKER_SECRET, "box9")).toBe(false);
      expect(registry.authenticateWorker(ADMIN_SECRET, "instabox-box9")).toBe(false);
    });

    it("rejects arbitrary unknown workerIds", () => {
      expect(registry.authenticateWorker(WORKER_SECRET, "instabox-unknown")).toBe(false);
      expect(registry.authenticateWorker(WORKER_SECRET, "rogue-worker")).toBe(false);
    });
  });

  describe("Fleet Credential Configuration Verification", () => {
    it("reports configured for node with valid per-worker secret", () => {
      expect(registry.isCredentialConfigured("box2")).toBe(true);
    });

    it("reports unconfigured for node without per-worker secret, even if generic worker secret exists", () => {
      // box3 has no per-worker secret; fallback to generic secret is removed
      expect(registry.isCredentialConfigured("box3")).toBe(false);
    });

    it("requires all eleven individual worker secrets for fleet readiness", () => {
      // With only box2 configured, fleet readiness must be false
      expect(registry.isCredentialConfigured()).toBe(false);

      // Configure all 11 worker node secrets
      for (const nodeId of INSTABOX_WORKER_NODE_IDS) {
        process.env[`INSTABOX_WORKER_SECRET_${nodeId.toUpperCase()}`] = `secret-for-${nodeId}-32chars-long!`;
      }
      expect(registry.isCredentialConfigured()).toBe(true);

      // If any single worker secret is missing or short, fleet readiness fails
      delete process.env.INSTABOX_WORKER_SECRET_BOX13;
      expect(registry.isCredentialConfigured()).toBe(false);

      process.env.INSTABOX_WORKER_SECRET_BOX13 = "too-short";
      expect(registry.isCredentialConfigured()).toBe(false);
    });

    it("reports unconfigured when secrets are missing or under 16 characters", () => {
      delete process.env.INSTABOX_WORKER_SECRET;
      delete process.env.INSTABOX_WORKER_SECRET_BOX2;
      delete process.env.RENDER_WORKER_SECRET;

      expect(registry.isCredentialConfigured("box2")).toBe(false);
      expect(registry.isCredentialConfigured("box3")).toBe(false);
      expect(registry.isCredentialConfigured()).toBe(false);

      // Placeholder or short secrets fail closed
      process.env.INSTABOX_WORKER_SECRET_BOX2 = "short";
      expect(registry.isCredentialConfigured("box2")).toBe(false);
    });
  });
});
