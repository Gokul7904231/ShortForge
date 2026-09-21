/**
 * FactoryOS Render Fabric — State Reconciler & Self-Healing Loop
 * Resolves drift between desired state and observed physical truth.
 */

import { RenderJobStateMachine } from "../state/RenderJobStateMachine";
import { WorkerFleetManager } from "../worker/WorkerFleetManager";
import { ContentAddressedStore } from "../../compute/cas/ContentAddressedStore";
import { FabricEventJournal } from "../events/FabricEventJournal";
import * as fs from "node:fs";

export interface ReconciliationReport {
  readonly timestamp: string;
  reconciledCount: number;
  recoveredArtifactCount: number;
  expiredLeaseCount: number;
  lostWorkerCount: number;
  actions: string[];
}

export class FabricReconciler {
  private stateMachine: RenderJobStateMachine;
  private fleet: WorkerFleetManager;
  private cas: ContentAddressedStore;
  private journal: FabricEventJournal;

  constructor(
    stateMachine: RenderJobStateMachine,
    fleet: WorkerFleetManager,
    cas?: ContentAddressedStore,
    journal?: FabricEventJournal
  ) {
    this.stateMachine = stateMachine;
    this.fleet = fleet;
    this.cas = cas || ContentAddressedStore.getInstance();
    this.journal = journal || FabricEventJournal.getInstance();
  }

  public async reconcile(options?: {
    artifactProbe?: (jobId: string) => Promise<{ exists: boolean; path?: string; sha256?: string }>;
  }): Promise<ReconciliationReport> {
    const report: ReconciliationReport = {
      timestamp: new Date().toISOString(),
      reconciledCount: 0,
      recoveredArtifactCount: 0,
      expiredLeaseCount: 0,
      lostWorkerCount: 0,
      actions: [],
    };

    const now = Date.now();
    const jobs = this.stateMachine.getAllJobs();

    for (const job of jobs) {
      if (job.state !== "CLAIMED" && job.state !== "RUNNING") {
        continue;
      }

      report.reconciledCount++;

      // 1. Check if finished artifact already exists (Lost-Callback Reconciliation)
      let artifactFound = false;
      let artifactPath = "";
      let artifactSha = "";

      if (options?.artifactProbe) {
        try {
          const probe = await options.artifactProbe(job.jobId);
          if (probe.exists && probe.path && fs.existsSync(probe.path)) {
            artifactFound = true;
            artifactPath = probe.path;
            artifactSha = probe.sha256 || "";
          }
        } catch {}
      }

      if (artifactFound) {
        const sha = artifactSha || (await ContentAddressedStore.computeFileSha256(artifactPath));
        const stat = fs.statSync(artifactPath);

        // Reconcile directly to SUCCEEDED without re-rendering!
        this.stateMachine.handleCallback({
          jobId: job.jobId,
          attemptId: job.activeAttemptId,
          fencingToken: job.activeFencingToken,
          workerId: job.activeWorkerId || "reconciled_worker",
          status: "succeeded",
          artifact: {
            uri: artifactPath,
            sha256: sha,
            byteLength: stat.size,
          },
        });

        report.recoveredArtifactCount++;
        report.actions.push(`RECOVERED_ARTIFACT: Job '${job.jobId}' reconciled from disk artifact at ${artifactPath}`);
        this.journal.record({
          type: "job.reconciled",
          subject: `job:${job.jobId}`,
          data: { jobId: job.jobId, action: "RECOVERED_ARTIFACT", path: artifactPath, sha256: sha },
        });
        continue;
      }

      // 2. Lease Expiry & Worker Liveness Check
      if (job.leaseExpiresAt && new Date(job.leaseExpiresAt).getTime() < now) {
        report.expiredLeaseCount++;
        job.state = "LEASE_EXPIRED";
        job.updatedAt = new Date().toISOString();

        report.actions.push(`LEASE_EXPIRED: Job '${job.jobId}' attempt #${job.activeAttemptId} lease expired.`);
        this.journal.record({
          type: "lease.expired",
          subject: `job:${job.jobId}`,
          data: { jobId: job.jobId, attemptId: job.activeAttemptId, expiredAt: job.leaseExpiresAt },
        });

        // 3. Worker check
        if (job.activeWorkerId) {
          const workerRecord = this.fleet.getWorker(job.activeWorkerId);
          if (!workerRecord || workerRecord.state === "OFFLINE") {
            report.lostWorkerCount++;
            job.state = "WORKER_LOST";
            report.actions.push(`WORKER_LOST: Worker '${job.activeWorkerId}' confirmed offline.`);
            this.journal.record({
              type: "worker.lost",
              subject: `worker:${job.activeWorkerId}`,
              data: { workerId: job.activeWorkerId, jobId: job.jobId },
            });
          }
        }
      }
    }

    return report;
  }
}
