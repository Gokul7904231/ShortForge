/**
 * FactoryOS v1 / Frontier v3 — Browser Evidence Resolver
 * Resolves browser evidence records (console, network, DOM state, screenshot, performance)
 * Enforces secret redaction via BrowserRedactor and prohibits synthetic browser facts.
 */

import { BrowserRedactor } from "../../runtime/BrowserRedactor";
import type { BrowserEvidenceRecord, BrowserRunRecord } from "../../contracts/browser.contract";
import type { BrowserEvidenceInspectionResult } from "./InteractionIR";

export class BrowserEvidenceResolver {
  public static resolve(
    evidenceId: string,
    records: BrowserEvidenceRecord[] = [],
    runContext?: Partial<BrowserRunRecord>
  ): BrowserEvidenceInspectionResult {
    const record = records.find((r) => r.id === evidenceId);

    if (!record) {
      return {
        evidenceId,
        kind: "CONSOLE",
        executionMode: runContext?.executionMode ?? "BLOCKED_BROWSER",
        truthLevel: "UNKNOWN",
        timestamp: new Date().toISOString(),
        sourcePage: "UNKNOWN",
        redactedKeysCount: 0,
        resolved: false,
      };
    }

    const executionMode = runContext?.executionMode ?? "LIVE_BROWSER";

    // Extract type-specific fields and apply redaction
    let requestUrl: string | undefined;
    let statusCode: number | undefined;
    let domSelector: string | undefined;
    let domState: string | undefined;
    let screenshotPath: string | undefined;
    let screenshotDigest: string | undefined;
    let performanceMetric: BrowserEvidenceInspectionResult["performanceMetric"] | undefined;
    let redactedKeysCount = 0;

    // Sanitize source URL
    const safeUrl = BrowserRedactor.redactUrl(record.url);
    if (safeUrl !== record.url) {
      redactedKeysCount++;
    }

    const meta = record.metadata as any;

    switch (record.kind) {
      case "CONSOLE":
        if (meta?.text) {
          const sanitizedText = BrowserRedactor.redactText(meta.text);
          if (sanitizedText !== meta.text) redactedKeysCount++;
          domState = sanitizedText;
        }
        break;

      case "NETWORK":
        if (meta?.url) {
          requestUrl = BrowserRedactor.redactUrl(meta.url);
          if (requestUrl !== meta.url) redactedKeysCount++;
        }
        statusCode = meta?.statusCode ?? meta?.status;
        if (meta?.headers) {
          const redactedHeaders = BrowserRedactor.redactHeaders(meta.headers);
          if (Object.keys(redactedHeaders).length !== Object.keys(meta.headers).length) {
            redactedKeysCount++;
          }
        }
        break;

      case "DOM_STATE":
        domSelector = meta?.selector;
        if (meta?.stateSummary) {
          domState = BrowserRedactor.redactText(meta.stateSummary);
          if (domState !== meta.stateSummary) redactedKeysCount++;
        }
        break;

      case "SCREENSHOT":
        screenshotPath = meta?.filePath ?? meta?.path;
        screenshotDigest = meta?.sha256 ?? meta?.digest;
        break;

      case "PERFORMANCE":
        performanceMetric = {
          navigationTimeMs: meta?.navigationTimeMs ?? meta?.timing?.loadEventEnd,
          memoryUsedMB: meta?.usedJSHeapSizeMB ?? meta?.metrics?.JSHeapUsedSize ? Math.round(meta.metrics.JSHeapUsedSize / 1048576) : undefined,
        };
        break;
    }

    return {
      evidenceId: record.id,
      kind: record.kind,
      executionMode,
      truthLevel: record.truthLevel,
      timestamp: record.timestamp,
      sourcePage: safeUrl,
      requestUrl,
      statusCode,
      domSelector,
      domState,
      screenshotPath,
      screenshotDigest,
      performanceMetric,
      redactedKeysCount,
      resolved: true,
    };
  }
}
