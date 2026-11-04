import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import { persistDeliveryReceipt } from "../lib/delivery/durable-delivery";
import { resolveDeliveryFacts } from "../lib/delivery/delivery-facts";
import { describeDelivery } from "../lib/presentation/JobStatusProjection";
import { getInMemoryJobs, readJobManifest, saveJobManifest } from "../lib/jobs-history";

const jobId = "delivery_recovery_001";
const outboxFile = path.join(process.cwd(), "data", "outbox", `${jobId}_outbox.json`);

function writeOutboxReceipt() {
  fs.mkdirSync(path.dirname(outboxFile), { recursive: true });
  fs.writeFileSync(
    outboxFile,
    JSON.stringify({
      jobId,
      status: "UPLOADED",
      deliveryArtifact: {
        deliveryMethod: "GOOGLE_DRIVE",
        verified: true,
        driveFileId: "stale_drive_file",
        uploadedAt: "2026-10-28T09:00:00.000Z",
      },
    })
  );
}

describe("durable delivery receipts survive a worker restart", () => {
  beforeEach(async () => {
    getInMemoryJobs().clear();
    await saveJobManifest(jobId, { userId: "owner_uid", status: "completed" });
  });

  afterEach(() => {
    if (fs.existsSync(outboxFile)) fs.unlinkSync(outboxFile);
    getInMemoryJobs().delete(jobId);
  });

  it("recovers a Drive delivery from the job document with no local outbox file", async () => {
    // The worker restarted, so only the durable job document is left.
    await persistDeliveryReceipt(
      jobId,
      {
        deliveryMethod: "GOOGLE_DRIVE",
        verified: true,
        driveFileId: "drive_file_42",
        uploadedAt: "2026-10-29T10:00:00.000Z",
      },
      "UPLOADED"
    );

    const manifest = await readJobManifest(jobId);
    const facts = resolveDeliveryFacts(jobId, manifest);
    const delivery = describeDelivery({ status: "completed", ...facts });

    expect(facts.source).toBe("job-document");
    expect(facts.deliveryMethod).toBe("GOOGLE_DRIVE");
    expect(delivery.state).toBe("DRIVE_DELIVERED");
    expect(delivery.linkUrl).toBe("https://drive.google.com/file/d/drive_file_42/view");
  });

  it("keeps an actual Drive upload distinct from a local-only copy", async () => {
    await persistDeliveryReceipt(jobId, { deliveryMethod: "LOCAL_OUTBOX", verified: true }, "UPLOADED");

    const delivery = describeDelivery({
      status: "completed",
      ...resolveDeliveryFacts(jobId, await readJobManifest(jobId)),
    });

    expect(delivery.state).toBe("OUTBOX_ONLY");
    expect(delivery.label.toLowerCase()).not.toContain("drive");
    expect(delivery.linkUrl).toBeUndefined();
  });

  it("reports an unconfirmed delivery as pending, not failed", async () => {
    await persistDeliveryReceipt(jobId, { deliveryMethod: "LOCAL_OUTBOX", verified: false }, "PENDING");

    const delivery = describeDelivery({
      status: "completed",
      ...resolveDeliveryFacts(jobId, await readJobManifest(jobId)),
    });

    expect(delivery.state).toBe("DELIVERY_PENDING");
    expect(delivery.detail.toLowerCase()).toContain("no upload is claimed");
  });

  it("keeps a failed delivery failed", async () => {
    await persistDeliveryReceipt(jobId, { deliveryMethod: "LOCAL_OUTBOX", verified: false }, "FAILED");

    const delivery = describeDelivery({
      status: "completed",
      ...resolveDeliveryFacts(jobId, await readJobManifest(jobId)),
    });

    expect(delivery.state).toBe("DELIVERY_FAILED");
  });

  it("falls back to the outbox receipt when no durable fields exist", () => {
    writeOutboxReceipt();

    const facts = resolveDeliveryFacts(jobId, null);
    expect(facts.source).toBe("outbox");
    expect(describeDelivery({ status: "completed", ...facts }).state).toBe("DRIVE_DELIVERED");
  });

  it("prefers the durable document over a stale Drive outbox receipt", async () => {
    writeOutboxReceipt();
    await persistDeliveryReceipt(jobId, { deliveryMethod: "LOCAL_OUTBOX", verified: true }, "UPLOADED");

    const facts = resolveDeliveryFacts(jobId, await readJobManifest(jobId));
    expect(facts.source).toBe("job-document");
    expect(facts.deliveryMethod).toBe("LOCAL_OUTBOX");
    expect(describeDelivery({ status: "completed", ...facts }).state).toBe("OUTBOX_ONLY");
  });
});
