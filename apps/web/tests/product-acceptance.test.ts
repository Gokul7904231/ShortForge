import { describe, it, expect, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import { describeDelivery } from "../lib/presentation/JobStatusProjection";
import { readDeliveryReceipt } from "../lib/delivery/outbox-record";
import { HealthManager } from "../lib/health-manager";

describe("describeDelivery", () => {
  it("reports a verified Drive upload only when a file id was recorded", () => {
    const delivery = describeDelivery({
      status: "completed",
      deliveryMethod: "GOOGLE_DRIVE",
      driveFileId: "file_123",
    });
    expect(delivery.state).toBe("DRIVE_DELIVERED");
    expect(delivery.linkUrl).toBe("https://drive.google.com/file/d/file_123/view");
  });

  it("keeps an unconfirmed Drive attempt out of the delivered state", () => {
    expect(
      describeDelivery({ status: "completed", deliveryMethod: "GOOGLE_DRIVE" }).state
    ).toBe("DRIVE_PENDING");
  });

  it("never labels a local outbox copy as a Drive delivery", () => {
    const delivery = describeDelivery({
      status: "completed",
      deliveryMethod: "LOCAL_OUTBOX",
      verified: true,
    });
    expect(delivery.state).toBe("OUTBOX_ONLY");
    expect(delivery.label.toLowerCase()).not.toContain("drive");
    expect(delivery.detail.toLowerCase()).toContain("not in google drive");
  });

  it("reports a failed outbox commit as a delivery failure", () => {
    expect(
      describeDelivery({ status: "completed", deliveryMethod: "LOCAL_OUTBOX", verified: false }).state
    ).toBe("DELIVERY_FAILED");
  });

  it("reports an unconfirmed local delivery as pending, not failed", () => {
    expect(
      describeDelivery({
        status: "completed",
        deliveryMethod: "LOCAL_OUTBOX",
        verified: false,
        deliveryStatus: "PENDING",
      }).state
    ).toBe("DELIVERY_PENDING");
  });

  it("treats a missing receipt as not recorded instead of delivered", () => {
    expect(describeDelivery({ status: "completed" }).state).toBe("NOT_RECORDED");
  });

  it("does not claim delivery before the render completes", () => {
    expect(describeDelivery({ status: "processing", deliveryMethod: "GOOGLE_DRIVE" }).state).toBe(
      "NOT_READY"
    );
  });
});

describe("readDeliveryReceipt", () => {
  const jobId = "acceptance_test_001";
  const outboxDir = path.join(process.cwd(), "data", "outbox");
  const file = path.join(outboxDir, `${jobId}_outbox.json`);

  afterEach(() => {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  });

  it("reads the delivery receipt the worker wrote", () => {
    fs.mkdirSync(outboxDir, { recursive: true });
    fs.writeFileSync(
      file,
      JSON.stringify({
        jobId,
        status: "UPLOADED",
        deliveryArtifact: {
          deliveryMethod: "LOCAL_OUTBOX",
          verified: true,
          sha256: "abc",
        },
      })
    );

    const receipt = readDeliveryReceipt(jobId);
    expect(receipt?.deliveryMethod).toBe("LOCAL_OUTBOX");
    expect(receipt?.verified).toBe(true);
  });

  it("refuses ids that would escape the outbox directory", () => {
    expect(readDeliveryReceipt("../../etc/passwd")).toBeNull();
    expect(readDeliveryReceipt("short")).toBeNull();
  });
});

describe("HealthManager readiness", () => {
  const driveEnv = [
    "GOOGLE_DRIVE_CLIENT_ID",
    "GOOGLE_DRIVE_CLIENT_SECRET",
    "GOOGLE_DRIVE_REFRESH_TOKEN",
    "GD_SERVICE_ACCOUNT_KEY_PATH",
    "GOOGLE_APPLICATION_CREDENTIALS",
  ];
  const saved = new Map<string, string | undefined>();

  afterEach(() => {
    for (const key of driveEnv) {
      if (saved.has(key)) {
        const value = saved.get(key);
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
    saved.clear();
  });

  it("separates reachability from readiness and reports no invented uptime", async () => {
    const report = await HealthManager.check();
    expect(report.reachable).toBe(true);
    expect(report.ready).toBe(report.status === "healthy");
    expect(report).not.toHaveProperty("uptime");
    expect(report.checks).toBe("local-storage-and-configuration");
  });

  it("marks Drive as degraded and the system unready when Drive is unconfigured", async () => {
    for (const key of driveEnv) {
      saved.set(key, process.env[key]);
      delete process.env[key];
    }

    const report = await HealthManager.check();
    expect(report.dependencies["google-drive"].status).toBe("degraded");
    expect(report.ready).toBe(false);
  });

  it("flags a Drive key path that points at a missing file", async () => {
    for (const key of driveEnv) {
      saved.set(key, process.env[key]);
      delete process.env[key];
    }
    process.env.GD_SERVICE_ACCOUNT_KEY_PATH = path.join(process.cwd(), "data", "does-not-exist-key.json");

    const report = await HealthManager.check();
    expect(report.dependencies["google-drive"].status).toBe("degraded");
    expect(report.dependencies["google-drive"].reason).toContain("file is missing");
  });
});
