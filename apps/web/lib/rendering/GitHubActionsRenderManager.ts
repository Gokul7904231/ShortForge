import { UniversalRenderJob } from "./RenderQueueManager";
import { BasicRenderingCapacityGuard } from "./BasicRenderingCapacityGuard";
import crypto from "crypto";

export interface WorkflowDispatchParams {
  jobId: string;
  tenantId: string;
  userId: string;
  factoryVersion: string;
  aspectRatio: string;
  outputFormat: string;
}

export interface WorkflowRunRecord {
  jobId: string;
  tenantId: string;
  runId?: number;
  executionToken: string;
  tokenExpiresAt: number;
  status: "QUEUED" | "DISPATCHED" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED" | "TIMEOUT";
  dispatchedAt: string;
  updatedAt: string;
  error?: string;
}

export class GitHubActionsRenderManagerClass {
  private activeRuns = new Map<string, WorkflowRunRecord>();
  private repository = process.env.GITHUB_RENDER_REPOSITORY || "FactoryOS/factoryos-basic-renderer";
  private workflowFile = process.env.GITHUB_RENDER_WORKFLOW || "factoryos-basic-render.yml";
  private ref = process.env.GITHUB_RENDER_REF || "main";
  private maxDurationMs = parseInt(process.env.BASIC_RENDER_MAX_DURATION_SECONDS || "300", 10) * 1000;

  /**
   * Issue a short-lived, job-scoped execution token for a GitHub runner.
   */
  public generateExecutionToken(jobId: string, tenantId: string): { token: string; expiresAt: number } {
    const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes TTL
    // Fail closed: signing with a committed fallback key would forge verifiable tokens.
    const secret = process.env.FACTORYOS_EXECUTION_SECRET;
    if (!secret) {
      throw new Error("EXECUTION_SECRET_MISSING: FACTORYOS_EXECUTION_SECRET is required to sign execution tokens.");
    }
    const payload = `${jobId}:${tenantId}:${expiresAt}`;
    const signature = crypto.createHmac("sha256", secret).update(payload).digest("hex");
    const token = `${payload}:${signature}`;
    return { token, expiresAt };
  }

  /**
   * Verify an execution token supplied by a GitHub Actions runner.
   */
  public verifyExecutionToken(token: string, jobId: string, tenantId: string): boolean {
    try {
      const parts = token.split(":");
      if (parts.length !== 4) return false;
      const [tJobId, tTenantId, tExpiresAtStr, signature] = parts;
      if (tJobId !== jobId || tTenantId !== tenantId) return false;

      const expiresAt = parseInt(tExpiresAtStr, 10);
      if (Date.now() > expiresAt) return false;

      // Fail closed: never verify against a fallback key.
      const secret = process.env.FACTORYOS_EXECUTION_SECRET;
      if (!secret) return false;
      const expectedPayload = `${tJobId}:${tTenantId}:${tExpiresAtStr}`;
      const expectedSignature = crypto.createHmac("sha256", secret).update(expectedPayload).digest("hex");

      return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
    } catch (err) {
      return false;
    }
  }

  /**
   * Dispatch a workflow run via GitHub REST API (workflow_dispatch).
   */
  public async dispatchWorkflowRun(job: UniversalRenderJob): Promise<{ success: boolean; runRecord?: WorkflowRunRecord; error?: string }> {
    // Local billing safety check
    const guardCheck = BasicRenderingCapacityGuard.checkBasicDispatchAllowed(job.userId, job.tenantId);
    if (!guardCheck.allowed) {
      return { success: false, error: guardCheck.reason };
    }

    // Fail closed: an unconfigured dispatch must never be reported as DISPATCHED —
    // dry-run simulation is not production dispatch.
    if (!process.env.FACTORYOS_EXECUTION_SECRET) {
      return { success: false, error: "EXECUTION_SECRET_MISSING: FACTORYOS_EXECUTION_SECRET is required to sign execution tokens." };
    }
    const githubToken = process.env.GITHUB_RENDER_TOKEN;
    if (!githubToken || githubToken === "mock_github_token") {
      return { success: false, error: "RENDER_DISPATCH_NOT_CONFIGURED: GITHUB_RENDER_TOKEN is missing; refusing to simulate dispatch." };
    }

    const { token, expiresAt } = this.generateExecutionToken(job.id, job.tenantId);

    const runRecord: WorkflowRunRecord = {
      jobId: job.id,
      tenantId: job.tenantId,
      executionToken: token,
      tokenExpiresAt: expiresAt,
      status: "DISPATCHED",
      dispatchedAt: job.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.activeRuns.set(job.id, runRecord);

    try {
      const response = await fetch(`https://api.github.com/repos/${this.repository}/actions/workflows/${this.workflowFile}/dispatches`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "User-Agent": "FactoryOS-Control-Plane",
        },
        body: JSON.stringify({
          ref: this.ref,
          inputs: {
            jobId: job.id,
            executionToken: token,
          },
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        runRecord.status = "FAILED";
        runRecord.error = `GitHub API workflow_dispatch failed (${response.status}): ${errText}`;
        return { success: false, error: runRecord.error };
      }
    } catch (err: any) {
        runRecord.status = "FAILED";
        runRecord.error = `GitHub dispatch network error: ${err.message}`;
        return { success: false, error: runRecord.error };
      }

    return { success: true, runRecord };
  }

  /**
   * Handle runner progress or status callback from GitHub workflow.
   */
  public handleWorkflowCallback(
    jobId: string,
    tenantId: string,
    token: string,
    status: "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED",
    details?: { runId?: number; artifactUri?: string; artifactSizeBytes?: number; durationMs?: number; error?: string }
  ): { success: boolean; error?: string } {
    if (!this.verifyExecutionToken(token, jobId, tenantId)) {
      return { success: false, error: "UNAUTHORIZED_EXECUTION_TOKEN: Invalid or expired execution token." };
    }

    const record = this.activeRuns.get(jobId);
    if (!record) {
      return { success: false, error: "WORKFLOW_RUN_NOT_FOUND: No active dispatch record for this jobId." };
    }

    record.status = status;
    record.updatedAt = new Date().toISOString();
    if (details?.runId) record.runId = details.runId;
    if (details?.error) record.error = details.error;

    return { success: true };
  }

  /**
   * Server-side independent MP4 artifact verification.
   */
  public verifyArtifactIntegrity(
    jobId: string,
    tenantId: string,
    artifactMeta: { sizeBytes: number; headerBytesHex?: string }
  ): { valid: boolean; error?: string } {
    if (!artifactMeta || !Number.isFinite(artifactMeta.sizeBytes) || artifactMeta.sizeBytes <= 0) {
      return { valid: false, error: "ARTIFACT_INVALID: Output MP4 size is 0 bytes or missing." };
    }

    // Physical-evidence invariant: completion requires actual artifact bytes, not metadata alone.
    if (!artifactMeta.headerBytesHex) {
      return { valid: false, error: "ARTIFACT_INVALID: Missing MP4 header bytes; metadata-only completion is rejected." };
    }

    const headerHex = artifactMeta.headerBytesHex.toLowerCase();
    // 'ftyp' in ASCII is 66747970
    if (!headerHex.includes("66747970")) {
      return { valid: false, error: "ARTIFACT_INVALID: Invalid MP4 container header." };
    }

    return { valid: true };
  }

  /**
   * Check timed out runs exceeding MAX_RENDER_DURATION_SECONDS.
   */
  public checkTimedOutRuns(): string[] {
    const now = Date.now();
    const timedOutJobIds: string[] = [];

    for (const [jobId, record] of this.activeRuns.entries()) {
      if (record.status === "DISPATCHED" || record.status === "PROCESSING") {
        const elapsed = now - new Date(record.dispatchedAt).getTime();
        if (elapsed > this.maxDurationMs) {
          record.status = "TIMEOUT";
          record.error = `RENDER_TIMEOUT: Workflow exceeded maximum duration of ${this.maxDurationMs / 1000}s`;
          timedOutJobIds.push(jobId);
        }
      }
    }
    return timedOutJobIds;
  }

  public getRunRecord(jobId: string): WorkflowRunRecord | undefined {
    return this.activeRuns.get(jobId);
  }

  public reset(): void {
    this.activeRuns.clear();
  }
}

export const GitHubActionsRenderManager = new GitHubActionsRenderManagerClass();
