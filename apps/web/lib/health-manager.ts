/**
 * Health Manager
 *
 * Reports reachability and readiness from the checks this process can actually
 * run: local persistence plus the presence of provider credentials.
 * It does not probe external services and does not claim uptime it never measured.
 */

import fs from "fs";
import { VersionRegistry } from "./version-registry";
import { getSqliteHealth } from "./safe-sqlite";

export interface ServiceHealth {
  service: string;
  status: "healthy" | "degraded" | "offline";
  lastCheck: string;
  reason: string;
}

export interface SystemHealthReport {
  status: "healthy" | "degraded" | "offline";
  ready: boolean;
  reachable: true;
  checks: "local-storage-and-configuration";
  latency: number;
  lastCheck: string;
  reason: string;
  version: string;
  dependencies: Record<string, ServiceHealth>;
}

const AI_PROVIDER_KEYS = [
  "GEMINI_API_KEY",
  "GROQ_API_KEY",
  "OPENROUTER_API_KEY",
  "HUGGINGFACE_API_KEY",
  "DEEPSEEK_API_KEY",
  "CEREBRAS_API_KEY",
];

export const HealthManager = {
  async check(): Promise<SystemHealthReport> {
    const start = Date.now();
    const checkedAt = new Date().toISOString();

    const driveOAuthConfigured = Boolean(
      process.env.GOOGLE_DRIVE_CLIENT_ID &&
        process.env.GOOGLE_DRIVE_CLIENT_SECRET &&
        process.env.GOOGLE_DRIVE_REFRESH_TOKEN
    );
    // A configured key path that points nowhere is the exact failure mode that
    // produced a green health signal while Drive delivery was broken.
    const driveKeyPath =
      process.env.GD_SERVICE_ACCOUNT_KEY_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const driveKeyFileExists = Boolean(driveKeyPath && fs.existsSync(driveKeyPath));
    const driveConfigured = driveOAuthConfigured || driveKeyFileExists;
    const aiKeyCount = AI_PROVIDER_KEYS.filter((name) => Boolean(process.env[name])).length;
    const rendererConfigured = Boolean(process.env.NEXT_PUBLIC_RENDER_ENGINE_URL);

    const dependencies: Record<string, ServiceHealth> = {
      "google-drive": {
        service: "google-drive",
        status: driveConfigured ? "healthy" : "degraded",
        lastCheck: checkedAt,
        reason: driveConfigured
          ? `Drive credentials are configured (${driveOAuthConfigured ? "OAuth refresh token" : "service account key file"}). Not probed by this endpoint; per-job delivery status is read from each delivery receipt.`
          : driveKeyPath
            ? `Drive key path is configured but the file is missing (${driveKeyPath}). Drive delivery cannot run.`
            : "No GOOGLE_DRIVE_CLIENT_ID/SECRET/REFRESH_TOKEN and no service account key path. Drive delivery cannot run.",
      },
      "youtube-publisher": {
        service: "youtube-publisher",
        status: process.env.YOUTUBE_REFRESH_TOKEN ? "healthy" : "degraded",
        lastCheck: checkedAt,
        reason: process.env.YOUTUBE_REFRESH_TOKEN
          ? "YOUTUBE_REFRESH_TOKEN is configured. Not probed by this endpoint."
          : "YOUTUBE_REFRESH_TOKEN is missing. YouTube publishing cannot run.",
      },
      "ai-capability-router": {
        service: "ai-capability-router",
        status: aiKeyCount > 0 ? "healthy" : "degraded",
        lastCheck: checkedAt,
        reason:
          aiKeyCount > 0
            ? `${aiKeyCount} AI provider credential(s) configured. Provider reachability is not probed by this endpoint.`
            : "No AI provider credentials configured.",
      },
      "local-renderer": {
        service: "local-renderer",
        status: rendererConfigured ? "healthy" : "degraded",
        lastCheck: checkedAt,
        reason: rendererConfigured
          ? "NEXT_PUBLIC_RENDER_ENGINE_URL is configured. Live reachability is reported by /api/render-engine-health."
          : "NEXT_PUBLIC_RENDER_ENGINE_URL is not configured.",
      },
    };

    // Honest probe of the actual persistence layer: every SQLite-backed store
    // (render queue, checkpoints, authorization, journals) fails closed when
    // this binding cannot load, so readiness must surface it.
    const sqlite = getSqliteHealth();
    dependencies["sqlite-persistence"] = {
      service: "sqlite-persistence",
      status: sqlite.available ? "healthy" : "offline",
      lastCheck: checkedAt,
      reason: sqlite.available
        ? "Native better-sqlite3 binding loads"
        : `Native better-sqlite3 binding unavailable (${sqlite.error}); SQLite-backed stores fail closed`,
    };

    const failing = Object.values(dependencies).filter((d) => d.status !== "healthy");
    const offlineCount = failing.filter((d) => d.status === "offline").length;
    const status: SystemHealthReport["status"] =
      offlineCount > 0 ? "offline" : failing.length > 0 ? "degraded" : "healthy";

    return {
      status,
      ready: status === "healthy",
      reachable: true,
      checks: "local-storage-and-configuration",
      latency: Date.now() - start,
      lastCheck: checkedAt,
      reason:
        status === "healthy"
          ? "Reachable and ready: local storage loads and required credentials are configured."
          : `Reachable but not ready: ${failing.length} dependency check(s) failing (${failing.map((d) => d.service).join(", ")}).`,
      version: VersionRegistry.get("core"),
      dependencies,
    };
  },
};
