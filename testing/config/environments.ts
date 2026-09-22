import * as os from "node:os";
import { execSync } from "node:child_process";

export type ExecutionEnvironmentMode =
  | "REAL"
  | "REAL_WITH_DEGRADED_FALLBACK"
  | "SIMULATED"
  | "MOCKED"
  | "BLOCKED";

export interface EnvironmentCapabilityReport {
  readonly platform: string;
  readonly nodeVersion: string;
  readonly ffmpegAvailable: boolean;
  readonly ffmpegVersion?: string;
  readonly ffprobeAvailable: boolean;
  readonly ffprobeVersion?: string;
  readonly geminiApiKeyConfigured: boolean;
  readonly googleDriveConfigured: boolean;
  readonly gitCommit: string;
  readonly environmentMode: ExecutionEnvironmentMode;
}

export class EnvironmentManager {
  private static cachedReport?: EnvironmentCapabilityReport;

  public static getReport(): EnvironmentCapabilityReport {
    if (this.cachedReport) return this.cachedReport;

    let ffmpegAvailable = false;
    let ffmpegVersion: string | undefined;
    let ffprobeAvailable = false;
    let ffprobeVersion: string | undefined;

    try {
      const out = execSync("ffmpeg -version", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      ffmpegAvailable = true;
      ffmpegVersion = out.split("\n")[0].trim();
    } catch {}

    try {
      const out = execSync("ffprobe -version", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      ffprobeAvailable = true;
      ffprobeVersion = out.split("\n")[0].trim();
    } catch {}

    let gitCommit = "unknown";
    try {
      gitCommit = execSync("git rev-parse --short HEAD", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    } catch {}

    const geminiApiKeyConfigured = Boolean(
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY ||
      process.env.GOOGLE_GENERATIVE_AI_API_KEY
    );

    const googleDriveConfigured = Boolean(
      process.env.GOOGLE_DRIVE_CLIENT_EMAIL ||
      process.env.GOOGLE_DRIVE_CREDENTIALS_JSON ||
      (process.env.GOOGLE_DRIVE_CLIENT_ID && process.env.GOOGLE_DRIVE_REFRESH_TOKEN)
    );

    let environmentMode: ExecutionEnvironmentMode = "REAL";
    if (!ffmpegAvailable || !ffprobeAvailable) {
      environmentMode = "BLOCKED";
    } else if (!geminiApiKeyConfigured) {
      environmentMode = "REAL_WITH_DEGRADED_FALLBACK";
    }

    this.cachedReport = {
      platform: `${os.platform()} ${os.release()} (${os.arch()})`,
      nodeVersion: process.version,
      ffmpegAvailable,
      ffmpegVersion,
      ffprobeAvailable,
      ffprobeVersion,
      geminiApiKeyConfigured,
      googleDriveConfigured,
      gitCommit,
      environmentMode,
    };

    return this.cachedReport;
  }
}
