import type { BrowserRunRecord, BrowserEvidenceRecord } from "../../contracts/browser.contract";
import type { Finding } from "../../model/Finding";

export interface BrowserJudgeResult {
  readonly valid: boolean;
  readonly findings: Finding[];
  readonly errorCount: number;
  readonly failureCount: number;
}

export class BrowserJudge {
  public static judge(runRecord: BrowserRunRecord | undefined): BrowserJudgeResult {
    const findings: Finding[] = [];
    if (!runRecord) {
      return { valid: true, findings: [], errorCount: 0, failureCount: 0 };
    }

    let errorCount = 0;
    let failureCount = 0;

    for (const record of runRecord.records) {
      // 1. Console Errors
      if (record.kind === "CONSOLE") {
        const meta = record.metadata as any;
        if (meta.level === "error") {
          errorCount++;
          findings.push({
            id: `fnd_console_err_${record.id}`,
            rule: "browser/console-error",
            severity: "error",
            subject: `console@${record.url}`,
            expected: "No unhandled runtime errors in browser console",
            observed: meta.text,
            evidence: [record.id],
            rootCause: meta.stackTrace || meta.source || "Unhandled client-side exception",
            confidence: 0.95,
          });
        }
      }

      // 2. Network 5xx / 4xx Failures
      if (record.kind === "NETWORK") {
        const meta = record.metadata as any;
        if (meta.statusCode >= 500) {
          failureCount++;
          findings.push({
            id: `fnd_net_5xx_${record.id}`,
            rule: "browser/network-5xx",
            severity: "error",
            subject: `http@${meta.url}`,
            expected: `HTTP 2xx or 3xx status code`,
            observed: `HTTP ${meta.statusCode} (${meta.failureReason || "Server Error"})`,
            evidence: [record.id],
            rootCause: `Backend service failed during client request to ${meta.url}`,
            confidence: 0.95,
          });
        } else if (meta.statusCode >= 400) {
          failureCount++;
          findings.push({
            id: `fnd_net_4xx_${record.id}`,
            rule: "browser/network-4xx",
            severity: "warning",
            subject: `http@${meta.url}`,
            expected: `HTTP 2xx or 3xx status code`,
            observed: `HTTP ${meta.statusCode}`,
            evidence: [record.id],
            confidence: 0.9,
          });
        } else if (meta.failureReason) {
          failureCount++;
          findings.push({
            id: `fnd_net_fail_${record.id}`,
            rule: "browser/network-aborted",
            severity: "error",
            subject: `http@${meta.url}`,
            expected: "Completed network request",
            observed: `Network request failed: ${meta.failureReason}`,
            evidence: [record.id],
            confidence: 0.9,
          });
        }
      }

      // 3. DOM Missing Element
      if (record.kind === "DOM_STATE") {
        const meta = record.metadata as any;
        if (!meta.visible) {
          findings.push({
            id: `fnd_dom_missing_${record.id}`,
            rule: "browser/dom-required-element-missing",
            severity: "warning",
            subject: `dom@${meta.selector}`,
            expected: `Target element ${meta.selector} visible in viewport`,
            observed: `Element ${meta.selector} was not visible or not rendered`,
            evidence: [record.id],
            confidence: 0.9,
          });
        }
      }

      // 4. Performance Threshold Exceeded
      if (record.kind === "PERFORMANCE") {
        const meta = record.metadata as any;
        if (meta.thresholdExceeded) {
          findings.push({
            id: `fnd_perf_exceeded_${record.id}`,
            rule: "browser/performance-threshold-exceeded",
            severity: "warning",
            subject: `perf@${meta.metric}`,
            expected: `${meta.metric} <= ${meta.threshold}${meta.unit}`,
            observed: `${meta.metric} = ${meta.value}${meta.unit}`,
            evidence: [record.id],
            confidence: 0.9,
          });
        }
      }
    }

    return {
      valid: errorCount === 0 && failureCount === 0,
      findings,
      errorCount,
      failureCount,
    };
  }
}
