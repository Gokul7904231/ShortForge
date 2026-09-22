import { describe, it, expect, beforeEach } from "vitest";
import { CapabilityRegistry } from "../core/cognitive/CapabilityRegistry";
import path from "path";
import fs from "fs";

describe("FactoryOS Frontier v3 — Capability Authenticity & Rejection Suite", () => {
  let registry: CapabilityRegistry;

  beforeEach(() => {
    registry = new CapabilityRegistry();
  });

  describe("P0-B: Handlers Reject Invalid/Missing Inputs with Meaningful Failure", () => {
    it("1. instructor-schema-validator: Fails when payload is missing", async () => {
      const res = await registry.execute({
        requestExecutionId: "exec_inv_1",
        capabilityId: "instructor-schema-validator",
        missionId: "mis_auth_test",
        jobId: "job_auth_test",
        callerRole: "SYSTEM",
        floorId: "floor02_scripting",
        initiatedBy: "system",
        timestamp: new Date().toISOString(),
        inputData: {},
      });

      expect(res.status).toBe("FAILED");
      expect(res.error).toContain("Missing required parameter: payload");
    });

    it("2. instructor-schema-validator: Fails on invalid JSON syntax", async () => {
      const res = await registry.execute({
        requestExecutionId: "exec_inv_2",
        capabilityId: "instructor-schema-validator",
        missionId: "mis_auth_test",
        jobId: "job_auth_test",
        callerRole: "SYSTEM",
        floorId: "floor02_scripting",
        initiatedBy: "system",
        timestamp: new Date().toISOString(),
        inputData: {
          payload: "{ this is not valid json! @@@ }",
        },
      });

      expect(res.status).toBe("FAILED");
      expect(res.error).toContain("JSON syntax error");
    });

    it("3. instructor-schema-validator: Fails when required schema fields are missing", async () => {
      const res = await registry.execute({
        requestExecutionId: "exec_inv_3",
        capabilityId: "instructor-schema-validator",
        missionId: "mis_auth_test",
        jobId: "job_auth_test",
        callerRole: "SYSTEM",
        floorId: "floor02_scripting",
        initiatedBy: "system",
        timestamp: new Date().toISOString(),
        inputData: {
          payload: JSON.stringify({ title: "Shorts Video" }),
          schema: {
            required: ["title", "hook", "scenes"],
          },
        },
      });

      expect(res.status).toBe("FAILED");
      expect(res.error).toContain("Schema violation: missing required field(s): hook, scenes");
    });

    it("4. slayer-quality-diagnostic: Fails when no metrics or script text are provided", async () => {
      const res = await registry.execute({
        requestExecutionId: "exec_inv_4",
        capabilityId: "slayer-quality-diagnostic",
        missionId: "mis_auth_test",
        jobId: "job_auth_test",
        callerRole: "SYSTEM",
        floorId: "floor01_strategy",
        initiatedBy: "system",
        timestamp: new Date().toISOString(),
        inputData: {},
      });

      expect(res.status).toBe("FAILED");
      expect(res.error).toContain("Missing quality metrics or script text");
    });

    it("5. slayer-quality-diagnostic: Detects low quality and triggers diagnostic repair", async () => {
      const res = await registry.execute({
        requestExecutionId: "exec_inv_5",
        capabilityId: "slayer-quality-diagnostic",
        missionId: "mis_auth_test",
        jobId: "job_auth_test",
        callerRole: "SYSTEM",
        floorId: "floor01_strategy",
        initiatedBy: "system",
        timestamp: new Date().toISOString(),
        inputData: {
          qualityScore: 0.45,
          hookScore: 0.35,
          scriptText: "Too short",
        },
      });

      expect(res.status).toBe("SUCCESS");
      expect(res.repairAction).toBe("RE_PROMPT_WITH_STRATEGY_FEEDBACK");
      expect(res.findings).toEqual(
        expect.arrayContaining([
          expect.stringContaining("Low overall quality score"),
          expect.stringContaining("Weak narrative hook retention score"),
          expect.stringContaining("Script length abnormally short"),
        ])
      );
    });

    it("6. slayer-asset-diagnostic: Fails when neither assetPath nor prompt is provided", async () => {
      const res = await registry.execute({
        requestExecutionId: "exec_inv_6",
        capabilityId: "slayer-asset-diagnostic",
        missionId: "mis_auth_test",
        jobId: "job_auth_test",
        callerRole: "SYSTEM",
        floorId: "floor03_visual",
        initiatedBy: "system",
        timestamp: new Date().toISOString(),
        inputData: {},
      });

      expect(res.status).toBe("FAILED");
      expect(res.error).toContain("Missing required parameter: assetPath or prompt");
    });

    it("7. slayer-asset-diagnostic: Detects missing file on disk and aspect ratio mismatch", async () => {
      const nonExistentPath = path.join(process.cwd(), "non_existent_asset_xyz.png");
      const res = await registry.execute({
        requestExecutionId: "exec_inv_7",
        capabilityId: "slayer-asset-diagnostic",
        missionId: "mis_auth_test",
        jobId: "job_auth_test",
        callerRole: "SYSTEM",
        floorId: "floor03_visual",
        initiatedBy: "system",
        timestamp: new Date().toISOString(),
        inputData: {
          assetPath: nonExistentPath,
          aspectRatio: "16:9",
          prompt: "cinematic sunset",
        },
      });

      expect(res.status).toBe("SUCCESS");
      expect(res.repairAction).toBe("REGENERATE_SCENE_PROMPT");
      expect(res.outputData?.isCompliant).toBe(false);
      expect(res.findings).toEqual(
        expect.arrayContaining([
          expect.stringContaining("Asset file does not exist on disk"),
          expect.stringContaining("Aspect ratio mismatch: expected 9:16 vertical, got 16:9"),
        ])
      );
    });

    it("8. healer-artifact-reconciliation: Fails when target artifact does not exist on disk", async () => {
      const nonExistentPath = path.join(process.cwd(), "data", "renders", "missing_render_123.mp4");
      const res = await registry.execute({
        requestExecutionId: "exec_inv_8",
        capabilityId: "healer-artifact-reconciliation",
        missionId: "mis_auth_test",
        jobId: "job_auth_test",
        callerRole: "SYSTEM",
        floorId: "floor06_rendering",
        initiatedBy: "system",
        timestamp: new Date().toISOString(),
        inputData: {
          artifactPath: nonExistentPath,
        },
      });

      expect(res.status).toBe("FAILED");
      expect(res.error).toContain("Physical artifact not found on disk");
      expect(res.repairAction).toBe("TRIGGER_RERENDER");
    });

    it("9. healer-artifact-reconciliation: Fails when target artifact is 0 bytes", async () => {
      const emptyPath = path.join(process.cwd(), "empty_test_artifact.tmp");
      fs.writeFileSync(emptyPath, "");
      try {
        const res = await registry.execute({
          requestExecutionId: "exec_inv_9",
          capabilityId: "healer-artifact-reconciliation",
          missionId: "mis_auth_test",
          jobId: "job_auth_test",
          callerRole: "SYSTEM",
          floorId: "floor06_rendering",
          initiatedBy: "system",
          timestamp: new Date().toISOString(),
          inputData: {
            artifactPath: emptyPath,
          },
        });

        expect(res.status).toBe("FAILED");
        expect(res.error).toContain("Physical artifact is empty (0 bytes)");
        expect(res.repairAction).toBe("TRIGGER_RERENDER");
      } finally {
        if (fs.existsSync(emptyPath)) fs.unlinkSync(emptyPath);
      }
    });

    it("10. healer-render-recovery: Fails when jobId is missing", async () => {
      const res = await registry.execute({
        requestExecutionId: "exec_inv_10",
        capabilityId: "healer-render-recovery",
        missionId: "mis_auth_test",
        jobId: "job_auth_test",
        callerRole: "SYSTEM",
        floorId: "floor06_rendering",
        initiatedBy: "system",
        timestamp: new Date().toISOString(),
        inputData: {},
      });

      expect(res.status).toBe("FAILED");
      expect(res.error).toContain("Missing required parameter: jobId");
    });

    it("11. healer-render-recovery: Fails when jobId is unregistered in state machine", async () => {
      const res = await registry.execute({
        requestExecutionId: "exec_inv_11",
        capabilityId: "healer-render-recovery",
        missionId: "mis_auth_test",
        jobId: "job_auth_test",
        callerRole: "SYSTEM",
        floorId: "floor06_rendering",
        initiatedBy: "system",
        timestamp: new Date().toISOString(),
        inputData: {
          jobId: "unregistered_job_999",
        },
      });

      expect(res.status).toBe("FAILED");
      expect(res.error).toContain("Job 'unregistered_job_999' not found");
    });

    it("12. browser.access: Fails when URL is missing", async () => {
      const res = await registry.execute({
        requestExecutionId: "exec_inv_12",
        capabilityId: "browser.access",
        missionId: "mis_auth_test",
        jobId: "job_auth_test",
        callerRole: "SYSTEM",
        floorId: "floor00_analyst",
        initiatedBy: "system",
        timestamp: new Date().toISOString(),
        inputData: {},
      });

      expect(res.status).toBe("FAILED");
      expect(res.error).toContain("Missing required parameter: url");
    });

    it("13. analysis.hook: Fails when scriptText or topic is missing", async () => {
      const res = await registry.execute({
        requestExecutionId: "exec_inv_13",
        capabilityId: "analysis.hook",
        missionId: "mis_auth_test",
        jobId: "job_auth_test",
        callerRole: "SYSTEM",
        floorId: "floor00_analyst",
        initiatedBy: "system",
        timestamp: new Date().toISOString(),
        inputData: {},
      });

      expect(res.status).toBe("FAILED");
      expect(res.error).toContain("Missing required parameter: scriptText or topic");
    });

    it("14. render.ffmpeg: Fails when render intent is missing", async () => {
      const res = await registry.execute({
        requestExecutionId: "exec_inv_14",
        capabilityId: "render.ffmpeg",
        missionId: "mis_auth_test",
        jobId: "job_auth_test",
        callerRole: "SYSTEM",
        floorId: "floor06_rendering",
        initiatedBy: "system",
        timestamp: new Date().toISOString(),
        inputData: {},
      });

      expect(res.status).toBe("FAILED");
      expect(res.error).toContain("Missing required parameter: intent");
    });

    it("15. render.hyperframes: Is strictly rejected in production routing as PROTOTYPE", async () => {
      const res = await registry.execute({
        requestExecutionId: "exec_inv_15",
        capabilityId: "render.hyperframes",
        missionId: "mis_auth_test",
        jobId: "job_auth_test",
        callerRole: "SYSTEM",
        floorId: "floor06_rendering",
        initiatedBy: "system",
        timestamp: new Date().toISOString(),
        inputData: { canvasJson: "{}" },
      });

      expect(res.status).toBe("REJECTED");
      expect(res.error).toContain("PROTOTYPE/UNVERIFIED and cannot execute in production");
    });
  });
});
