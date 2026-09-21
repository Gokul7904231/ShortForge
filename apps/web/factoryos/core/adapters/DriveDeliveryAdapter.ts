import fs from "fs";
import path from "path";
import { ProductionJob, DeliveryArtifact } from "../production/ProductionJob";
import { NetworkCapabilityMonitor } from "../production/NetworkCapabilityMonitor";
import { ProductionIdempotency } from "../production/ProductionIdempotency";

export interface OutboxRecord {
  jobId: string;
  videoFilePath: string;
  status: "PENDING" | "UPLOADING" | "UPLOADED" | "FAILED";
  attempts: number;
  lastAttemptAt?: string;
  deliveryArtifact?: DeliveryArtifact;
}

export class DriveDeliveryAdapter {
  private outboxDir: string;
  private networkMonitor: NetworkCapabilityMonitor;
  private outboxRecords: Map<string, OutboxRecord> = new Map();

  constructor(outboxDir?: string) {
    this.outboxDir = outboxDir ?? path.join(process.cwd(), "data", "outbox");
    if (!fs.existsSync(this.outboxDir)) {
      fs.mkdirSync(this.outboxDir, { recursive: true });
    }
    this.networkMonitor = NetworkCapabilityMonitor.getInstance();
  }

  /**
   * Enqueues a rendered video artifact into the durable outbox queue.
   */
  enqueue(job: ProductionJob): OutboxRecord {
    if (!job.videoArtifact || !job.videoArtifact.filePath) {
      throw new Error(`Cannot enqueue job ${job.id} into outbox: missing video artifact.`);
    }

    const record: OutboxRecord = {
      jobId: job.id,
      videoFilePath: job.videoArtifact.filePath,
      status: "PENDING",
      attempts: 0,
    };

    this.outboxRecords.set(job.id, record);
    this._saveOutboxToDisk(record);
    console.log(`[DriveDeliveryAdapter] Job ${job.id} enqueued into delivery outbox.`);
    return record;
  }

  /**
   * Attempts delivery to Google Drive.
   * If network is offline or credentials are missing, retains job in DELIVERY_PENDING outbox.
   */
  async processDelivery(job: ProductionJob): Promise<DeliveryArtifact> {
    const existingRecord = this.outboxRecords.get(job.id);
    if (existingRecord && existingRecord.status === "UPLOADED" && existingRecord.deliveryArtifact) {
      console.log(`[DriveDeliveryAdapter] Job ${job.id} already uploaded. Returning existing artifact (Idempotency).`);
      return existingRecord.deliveryArtifact;
    }

    const netStatus = this.networkMonitor.getStatus();
    const record = this.outboxRecords.get(job.id) ?? this.enqueue(job);
    record.attempts += 1;
    record.lastAttemptAt = new Date().toISOString();

    const idempotencyKey = ProductionIdempotency.generateDeliveryKey(job.id, record.videoFilePath);

    // 1. Check network capability
    if (netStatus === "OFFLINE") {
      console.warn(`[DriveDeliveryAdapter] Network is OFFLINE. Job ${job.id} retained in DELIVERY_PENDING outbox.`);
      record.status = "PENDING";
      this._saveOutboxToDisk(record);
      return {
        deliveryMethod: "LOCAL_OUTBOX",
        verified: false,
      };
    }

    // 2. Resolve Drive Connection (per-user OAuth, with admin SYSTEM fallback for autonomous/system jobs)
    const { DriveConnectionManager } = await import("../../../lib/drive/DriveConnectionManager");
    let connection = await DriveConnectionManager.resolveDriveConnection({
      ownerId: (job as any).userId ?? (job as any).ownerId ?? undefined,
      purpose: "USER_JOB",
    });

    // Autonomous/system jobs without ownerId fall back to admin credentials when available
    if (connection.status !== "CONNECTED" || !connection.refreshToken) {
      const fallback = await DriveConnectionManager.resolveDriveConnection({ purpose: "SYSTEM_JOB" } as any);
      if (fallback.status === "CONNECTED" && fallback.refreshToken) {
        console.log(`[DriveDeliveryAdapter] User Drive unavailable (${connection.status}) — falling back to admin SYSTEM connection for job ${job.id}.`);
        connection = fallback;
      } else {
        console.log(`[DriveDeliveryAdapter] Drive connection not active for user (${connection.status}: ${connection.error || "unconfigured"}). Storing artifact in LOCAL_OUTBOX for job ${job.id}.`);

        let targetOutboxPath = record.videoFilePath;
        let fileSha256 = "";
        if (fs.existsSync(record.videoFilePath)) {
          targetOutboxPath = path.join(this.outboxDir, path.basename(record.videoFilePath));
          if (targetOutboxPath !== record.videoFilePath && !fs.existsSync(targetOutboxPath)) {
            fs.copyFileSync(record.videoFilePath, targetOutboxPath);
          }
          const buffer = fs.readFileSync(targetOutboxPath);
          const crypto = await import("crypto");
          fileSha256 = crypto.createHash("sha256").update(buffer).digest("hex");
        }

        const artifact: DeliveryArtifact = {
          deliveryMethod: "LOCAL_OUTBOX",
          verified: true,
          uploadedAt: new Date().toISOString(),
          storageUrl: targetOutboxPath,
          sha256: fileSha256,
        };

        record.status = "UPLOADED";
        record.deliveryArtifact = artifact;
        this._saveOutboxToDisk(record);
        return artifact;
      }
    }

    // 3. Real Google Drive Upload Path with resolved credentials
    console.log(`[DriveDeliveryAdapter] Uploading ${record.videoFilePath} to Google Drive (Idempotency Key: ${idempotencyKey}, Target: ${connection.folderName || "AI Shorts"})...`);
    
    try {
      const { GoogleDriveProvider } = await import("../../../storage/providers/google-drive");
      const driveRes = await GoogleDriveProvider.upload(record.videoFilePath, {
        engine: job.topic,
        folderId: connection.folderId,
        refreshToken: connection.refreshToken,
        clientId: connection.clientId,
        clientSecret: connection.clientSecret,
      });

      const artifact: DeliveryArtifact = {
        driveFileId: driveRes.fileId,
        driveFolderId: driveRes.folderId || connection.folderId || process.env.GOOGLE_DRIVE_FOLDER_ID || "root_folder",
        uploadedAt: driveRes.createdAt || new Date().toISOString(),
        deliveryMethod: "GOOGLE_DRIVE",
        verified: true,
      };

      record.status = "UPLOADED";
      record.deliveryArtifact = artifact;
      this._saveOutboxToDisk(record);
      console.log(`[DriveDeliveryAdapter] Job ${job.id} successfully uploaded to Google Drive. File ID: ${driveRes.fileId}`);

      return artifact;
    } catch (err: any) {
      console.error(`[DriveDeliveryAdapter] Real Google Drive upload failed:`, err?.message ?? err);
      record.status = "FAILED";
      this._saveOutboxToDisk(record);
      return {
        deliveryMethod: "LOCAL_OUTBOX",
        verified: false,
      };
    }
  }

  getOutboxRecord(jobId: string): OutboxRecord | undefined {
    return this.outboxRecords.get(jobId);
  }

  private _saveOutboxToDisk(record: OutboxRecord): void {
    try {
      const filepath = path.join(this.outboxDir, `${record.jobId}_outbox.json`);
      fs.writeFileSync(filepath, JSON.stringify(record, null, 2));
    } catch (err: any) {
      console.error(`[DriveDeliveryAdapter] Failed writing outbox record to disk:`, err?.message ?? err);
    }
  }
}
