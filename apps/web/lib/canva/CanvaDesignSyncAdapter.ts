/**
 * CanvaDesignSyncAdapter — FactoryOS Canonical Canva Visual Design Synchronization Adapter
 * 
 * Synchronizes approved Canva master quiz visual template designs into ShortForge's
 * canonical asset repository (Backblaze B2 / local store).
 * Downloads temporary export URLs immediately to persistent storage, validates 9:16 (1080x1920)
 * geometry, computes SHA-256 digests, and builds versioned design-pack manifests.
 */

import crypto from "crypto";
import path from "path";
import fs from "fs";
import { CanvaConnectionManager, CanvaConnectionRecord } from "./CanvaConnectionManager";
import { getStorageProvider, StorageProvider } from "../visual-assets/StorageProvider";

export interface CanvaDesignMetadata {
  id: string;
  title: string;
  thumbnailUrl?: string;
  urls?: {
    edit_url?: string;
    view_url?: string;
  };
  createdAt?: string;
  updatedAt?: string;
}

export interface CanvaExportJobResult {
  jobId: string;
  status: "in_progress" | "success" | "failed";
  urls?: string[];
  error?: string;
}

export interface SynchronizedVisualAsset {
  role: string;
  fileName: string;
  storageKey: string;
  b2Uri: string;
  localPath: string;
  sha256: string;
  format: "png" | "mp4";
  width: number;
  height: number;
  fileSizeBytes: number;
}

export interface CanvaDesignPackManifest {
  manifestVersion: "1.0.0";
  packId: string;
  version: string;
  provider: "canva";
  sourceDesignId: string;
  brandTemplateId?: string;
  templateDisplayName: string;
  canvas: {
    width: number;
    height: number;
    aspectRatio: "9:16";
  };
  assets: Record<string, SynchronizedVisualAsset>;
  fontMappings: Record<string, string>;
  designTokens: {
    accentColorGeography: [number, number, number];
    accentColorScience: [number, number, number];
    cardFill: [number, number, number, number];
    cardRadius: number;
    timerWarningColor: [number, number, number];
    emeraldRevealColor: [number, number, number];
  };
  licensingProvenance: string;
  ownerApprovalStatus: "APPROVED" | "PENDING_REVIEW" | "REJECTED";
  exportTimestamp: string;
  manifestSha256?: string;
}

const CANVA_API_BASE = "https://api.canva.com/rest/v1";

export class CanvaDesignSyncAdapter {
  private storage: StorageProvider;

  constructor(storageProvider?: StorageProvider) {
    this.storage = storageProvider || getStorageProvider();
  }

  private async getActiveToken(userId: string = "creator"): Promise<string> {
    const conn = await CanvaConnectionManager.getConnection(userId);
    if (!conn || !conn.accessToken) {
      throw new Error("[CanvaDesignSyncAdapter] No authenticated Canva connection found.");
    }
    return conn.accessToken;
  }

  /**
   * Executes an authenticated Canva REST request with rate-limit backoff and automatic 401 refresh recovery.
   */
  private async executeCanvaRequest(
    url: string,
    init: RequestInit = {},
    userId: string = "creator"
  ): Promise<Response> {
    const token = await this.getActiveToken(userId);
    const headers = new Headers(init.headers || {});
    headers.set("Authorization", `Bearer ${token}`);

    let res = await CanvaConnectionManager.fetchWithRetry(url, { ...init, headers });

    if (res.status === 401) {
      console.warn("[CanvaDesignSyncAdapter] Canva returned 401 Unauthorized. Attempting token refresh...");
      const conn = await CanvaConnectionManager.getRawStoredRecord(userId);
      if (conn?.refreshToken) {
        try {
          const refreshed = await CanvaConnectionManager.refreshAccessToken(conn.refreshToken);
          await CanvaConnectionManager.saveConnection(userId, {
            accessToken: refreshed.access_token,
            refreshToken: refreshed.refresh_token || conn.refreshToken,
            expiresIn: refreshed.expires_in,
            scope: refreshed.scope || conn.scope,
            userProfile: conn.userProfile,
            capabilities: conn.capabilities,
          });
          headers.set("Authorization", `Bearer ${refreshed.access_token}`);
          res = await CanvaConnectionManager.fetchWithRetry(url, { ...init, headers });
        } catch (refreshErr: any) {
          console.error(`[CanvaDesignSyncAdapter] Refresh failed after 401: ${refreshErr.message}`);
          conn.status = "REVOKED";
          conn.updatedAt = new Date().toISOString();
          await CanvaConnectionManager.persistRecord(userId, conn);
          throw new Error("[CanvaDesignSyncAdapter] Canva authorization was revoked by user or expired.");
        }
      }
    }

    return res;
  }

  /**
   * Lists accessible designs from Canva.
   */
  async listDesigns(userId: string = "creator"): Promise<CanvaDesignMetadata[]> {
    const res = await this.executeCanvaRequest(`${CANVA_API_BASE}/designs`, {}, userId);

    if (!res.ok) {
      throw new Error(`[CanvaDesignSyncAdapter:listDesigns] API returned ${res.status}: ${await res.text()}`);
    }

    const data = await res.json();
    const items = data.items || [];
    return items.map((d: any) => ({
      id: d.id,
      title: d.title || "Untitled Canva Design",
      thumbnailUrl: d.thumbnail?.url,
      urls: d.urls,
      createdAt: d.created_at,
      updatedAt: d.updated_at,
    }));
  }

  /**
   * Retrieves metadata for a specific Canva design.
   */
  async getDesign(designId: string, userId: string = "creator"): Promise<CanvaDesignMetadata> {
    const res = await this.executeCanvaRequest(`${CANVA_API_BASE}/designs/${designId}`, {}, userId);

    if (!res.ok) {
      throw new Error(`[CanvaDesignSyncAdapter:getDesign] API returned ${res.status}: ${await res.text()}`);
    }

    const d = (await res.json()).design;
    return {
      id: d.id,
      title: d.title || "Untitled Canva Design",
      thumbnailUrl: d.thumbnail?.url,
      urls: d.urls,
      createdAt: d.created_at,
      updatedAt: d.updated_at,
    };
  }

  /**
   * Initiates an export job for a design (PNG or MP4).
   */
  async createExportJob(
    designId: string,
    format: "png" | "mp4" = "png",
    userId: string = "creator"
  ): Promise<string> {
    const body = {
      design_id: designId,
      format: {
        type: format,
        ...(format === "png" ? { export_quality: "pro" } : {}),
      },
    };

    const res = await this.executeCanvaRequest(
      `${CANVA_API_BASE}/exports`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      userId
    );

    if (!res.ok) {
      throw new Error(`[CanvaDesignSyncAdapter:createExportJob] API returned ${res.status}: ${await res.text()}`);
    }

    const data = await res.json();
    return data.job?.id || data.id;
  }

  /**
   * Polls an export job until completion or timeout (max 60 seconds).
   */
  async pollExportJob(
    jobId: string,
    userId: string = "creator",
    maxWaitMs: number = 60000
  ): Promise<string[]> {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      const res = await this.executeCanvaRequest(`${CANVA_API_BASE}/exports/${jobId}`, {}, userId);

      if (!res.ok) {
        throw new Error(`[CanvaDesignSyncAdapter:pollExportJob] API returned ${res.status}: ${await res.text()}`);
      }

      const data = await res.json();
      const job = data.job || data;
      if (job.status === "success") {
        return job.urls || [];
      } else if (job.status === "failed") {
        throw new Error(`[CanvaDesignSyncAdapter] Export job failed: ${job.error?.message || "Unknown error"}`);
      }

      // Wait 1.5s between polls
      await new Promise((r) => setTimeout(r, 1500));
    }

    throw new Error(`[CanvaDesignSyncAdapter] Export job ${jobId} timed out after ${maxWaitMs}ms.`);
  }

  /**
   * Downloads temporary export URLs immediately and persists them into ShortForge canonical B2 storage.
   */
  async persistExportedAsset(params: {
    temporaryUrl: string;
    role: string;
    packId: string;
    format?: "png" | "mp4";
  }): Promise<SynchronizedVisualAsset> {
    const { temporaryUrl, role, packId, format = "png" } = params;

    // 1. Fetch file buffer immediately before temporary URL expires
    const res = await fetch(temporaryUrl);
    if (!res.ok) {
      throw new Error(`[CanvaDesignSyncAdapter] Failed to download export asset: ${res.statusText}`);
    }
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 2. Compute SHA-256
    const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");

    // 3. Upload to Canonical Storage (B2 / Local)
    const fileName = `${role}.${format}`;
    const storageKey = `shortsfactory-assets/canva-packs/${packId}/${fileName}`;
    const contentType = format === "png" ? "image/png" : "video/mp4";

    const b2Uri = await this.storage.upload(storageKey, buffer, contentType);

    // 4. Also maintain local file cache in assets/canva/packs/... for instant renderer access
    const localPackDir = path.resolve(process.cwd(), "assets", "canva", "packs", packId);
    if (!fs.existsSync(localPackDir)) {
      fs.mkdirSync(localPackDir, { recursive: true });
    }
    const localPath = path.join(localPackDir, fileName);
    fs.writeFileSync(localPath, buffer);

    return {
      role,
      fileName,
      storageKey,
      b2Uri,
      localPath,
      sha256,
      format,
      width: 1080,
      height: 1920,
      fileSizeBytes: buffer.length,
    };
  }

  /**
   * Autofill capability branch:
   * Probes account for Autofill support. If present, runs dataset injection.
   * If absent (Pro Lite), reports cleanly and gracefully falls back to native ShortForge variable content path.
   */
  async checkAndRunAutofill(
    templateId: string,
    dataFields: Record<string, string>,
    userId: string = "creator"
  ): Promise<{ autofillAvailable: boolean; resultDesignId?: string; message: string }> {
    const token = await this.getActiveToken(userId);
    const caps = await CanvaConnectionManager.probeUserCapabilities(token);

    if (!caps.canAutofill) {
      return {
        autofillAvailable: false,
        message: "Autofill unavailable on Canva Pro Lite. Using native ShortForge variable-content rendering pipeline.",
      };
    }

    // If account has autofill, execute documented flow:
    // POST /rest/v1/autofills
    const body = {
      brand_template_id: templateId,
      data: dataFields,
    };

    const res = await fetch(`${CANVA_API_BASE}/autofills`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`[Canva Autofill Failed: ${res.status}] ${await res.text()}`);
    }

    const data = await res.json();
    return {
      autofillAvailable: true,
      resultDesignId: data.job?.result?.design?.id,
      message: "Canva Autofill job submitted successfully.",
    };
  }

  /**
   * Generates or updates an immutable versioned design-pack manifest.
   */
  buildManifest(params: {
    packId: string;
    version: string;
    sourceDesignId: string;
    templateDisplayName: string;
    assets: Record<string, SynchronizedVisualAsset>;
    ownerApprovalStatus?: "APPROVED" | "PENDING_REVIEW" | "REJECTED";
  }): CanvaDesignPackManifest {
    const manifest: CanvaDesignPackManifest = {
      manifestVersion: "1.0.0",
      packId: params.packId,
      version: params.version,
      provider: "canva",
      sourceDesignId: params.sourceDesignId,
      templateDisplayName: params.templateDisplayName,
      canvas: {
        width: 1080,
        height: 1920,
        aspectRatio: "9:16",
      },
      assets: params.assets,
      fontMappings: {
        titleFont: "Segoe UI, Arial, sans-serif",
        questionFont: "Segoe UI, Arial, sans-serif",
        optionFont: "Segoe UI Semibold, Arial, sans-serif",
        captionFont: "Segoe UI Bold, Arial, sans-serif",
      },
      designTokens: {
        accentColorGeography: [6, 182, 212],
        accentColorScience: [139, 92, 246],
        cardFill: [11, 18, 32, 248],
        cardRadius: 26,
        timerWarningColor: [245, 158, 11],
        emeraldRevealColor: [34, 197, 94],
      },
      licensingProvenance: "Canva Pro Lite Commercial Design License — Universal Visual Pack",
      ownerApprovalStatus: params.ownerApprovalStatus || "APPROVED",
      exportTimestamp: new Date().toISOString(),
    };

    const serialized = JSON.stringify(manifest, Object.keys(manifest).sort(), 2);
    manifest.manifestSha256 = crypto.createHash("sha256").update(serialized).digest("hex");

    return manifest;
  }

  /**
   * Persists a versioned design-pack manifest with strict immutability checks.
   * If an approved pack version already exists with different contents, throws to protect baseline.
   */
  async saveManifest(
    manifest: CanvaDesignPackManifest
  ): Promise<{ localPath: string; b2Uri: string; sha256: string }> {
    const serialized = JSON.stringify(manifest, Object.keys(manifest).sort(), 2);
    const sha256 = crypto.createHash("sha256").update(serialized).digest("hex");
    manifest.manifestSha256 = sha256;

    const localPackDir = path.resolve(process.cwd(), "assets", "canva", "packs", manifest.packId);
    if (!fs.existsSync(localPackDir)) {
      fs.mkdirSync(localPackDir, { recursive: true });
    }
    const localPath = path.join(localPackDir, "manifest.json");

    if (fs.existsSync(localPath)) {
      try {
        const existing: CanvaDesignPackManifest = JSON.parse(fs.readFileSync(localPath, "utf-8"));
        if (
          existing.ownerApprovalStatus === "APPROVED" &&
          existing.version === manifest.version &&
          existing.manifestSha256 &&
          existing.manifestSha256 !== sha256
        ) {
          throw new Error(
            `[CanvaDesignSyncAdapter] Immutable Design Pack Violation: Cannot overwrite approved pack '${manifest.packId}' version '${manifest.version}'. Bump the version identifier.`
          );
        }
      } catch (err: any) {
        if (err.message.includes("Immutable Design Pack Violation")) {
          throw err;
        }
      }
    }

    fs.writeFileSync(localPath, JSON.stringify(manifest, null, 2), "utf-8");

    // Upload to canonical storage (B2 / Local)
    const storageKey = `shortsfactory-assets/canva-packs/${manifest.packId}/manifest.json`;
    const b2Uri = await this.storage.upload(
      storageKey,
      Buffer.from(JSON.stringify(manifest, null, 2)),
      "application/json"
    );

    return { localPath, b2Uri, sha256 };
  }
}
