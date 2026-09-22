import * as fs from "node:fs";
import * as crypto from "node:crypto";
import type { MissionRun } from "../../model/MissionRun";
import type { Finding } from "../../model/Finding";
import type { DeliveryState } from "../../contracts/delivery.contract";

export interface DeliveryJudgeResult {
  readonly localDelivered: boolean;
  readonly localStatus: DeliveryState;
  readonly remoteDelivered: boolean;
  readonly remoteStatus: DeliveryState;
  readonly delivered: boolean;
  readonly findings: Finding[];
}

export class DeliveryJudge {
  public static judge(run: MissionRun): DeliveryJudgeResult {
    const findings: Finding[] = [];
    const del = run.deliveryRecord;

    if (!del) {
      findings.push({
        id: "find_del_record_missing",
        rule: "delivery/record-missing",
        severity: "error",
        subject: "delivery_outbox",
        evidence: ["No delivery record found in mission run"],
        expected: "Delivery record with outbox location",
        observed: "Delivery record missing",
        confidence: 1.0,
        supportedRepairs: [],
      });
      return {
        localDelivered: false,
        localStatus: "FAILED",
        remoteDelivered: false,
        remoteStatus: "FAILED",
        delivered: false,
        findings,
      };
    }

    let localDelivered = false;
    let localStatus: DeliveryState = del.localStatus || "PREPARED";
    let remoteDelivered = false;
    let remoteStatus: DeliveryState = del.remoteStatus || "NOT_ATTEMPTED";

    // 1. Verify Local Outbox Delivery
    const localTarget = del.localPath || del.targetLocation;
    if (!fs.existsSync(localTarget) || fs.statSync(localTarget).isDirectory()) {
      localStatus = "FAILED";
      findings.push({
        id: "find_del_file_missing_on_disk",
        rule: "delivery/file-missing-in-outbox",
        severity: "critical",
        subject: localTarget,
        evidence: [`Outbox delivery file not found or is a directory at ${localTarget}`],
        expected: "Physical file in outbox directory",
        observed: "File not found or is directory",
        confidence: 1.0,
        supportedRepairs: [],
      });
    } else {
      const buffer = fs.readFileSync(localTarget);
      const computedSha = crypto.createHash("sha256").update(buffer).digest("hex");
      if (del.sha256 && computedSha !== del.sha256) {
        localStatus = "FAILED";
        findings.push({
          id: "find_del_sha_mismatch",
          rule: "delivery/sha256-mismatch",
          severity: "critical",
          subject: localTarget,
          evidence: [`Outbox file SHA-256 (${computedSha}) does not match delivery record SHA-256 (${del.sha256})`],
          expected: `SHA-256: ${del.sha256}`,
          observed: `SHA-256: ${computedSha}`,
          confidence: 1.0,
          supportedRepairs: [],
        });
      } else {
        localDelivered = true;
        localStatus = "LOCALLY_COMMITTED";
      }
    }

    // 2. Verify Remote Delivery (Google Drive)
    if (del.method === "GOOGLE_DRIVE") {
      if (del.remoteLocation || del.remoteVerificationDetails) {
        remoteDelivered = true;
        remoteStatus = "REMOTE_VERIFIED";
      } else {
        remoteStatus = "REMOTE_UPLOADED";
      }
    } else {
      // Local delivery only: remote upload was not attempted or blocked
      remoteDelivered = false;
      remoteStatus = del.remoteStatus || "NOT_ATTEMPTED";
    }

    return {
      localDelivered,
      localStatus,
      remoteDelivered,
      remoteStatus,
      delivered: localDelivered,
      findings,
    };
  }
}
