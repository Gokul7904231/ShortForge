import type { ChromeDevToolsClient } from "./ChromeDevToolsClient";
import type { BrowserEvidenceRecord } from "../contracts/browser.contract";

export interface PerformanceThresholdConfig {
  readonly maxDomContentLoadedMs?: number;
  readonly maxLoadDurationMs?: number;
  readonly maxFirstContentfulPaintMs?: number;
  readonly maxHeapSizeBytes?: number;
}

export interface RawNavigationTiming {
  readonly domContentLoadedMs: number;
  readonly loadDurationMs: number;
  readonly firstContentfulPaintMs?: number;
  readonly jsHeapSizeBytes?: number;
}

export class BrowserPerformanceCollector {
  private readonly client: ChromeDevToolsClient;
  private readonly thresholds: PerformanceThresholdConfig;

  constructor(
    client: ChromeDevToolsClient,
    thresholds: PerformanceThresholdConfig = {
      maxDomContentLoadedMs: 3000,
      maxLoadDurationMs: 5000,
      maxFirstContentfulPaintMs: 2000,
    }
  ) {
    this.client = client;
    this.thresholds = thresholds;
  }

  /**
   * Translates observed navigation and rendering metrics into canonical BrowserEvidenceRecords.
   * Keeps raw metrics strictly typed as OBSERVED without subjective scoring.
   */
  public recordNavigationMetrics(params: {
    missionId: string;
    runId: string;
    page: string;
    url: string;
    metrics: RawNavigationTiming;
    actionContext?: string;
  }): BrowserEvidenceRecord[] {
    const records: BrowserEvidenceRecord[] = [];

    // 1. DOMContentLoaded Timing
    records.push(
      this.client.createPerformanceRecord({
        missionId: params.missionId,
        runId: params.runId,
        page: params.page,
        url: params.url,
        metric: "domContentLoadedDuration",
        value: params.metrics.domContentLoadedMs,
        unit: "ms",
        threshold: this.thresholds.maxDomContentLoadedMs,
        actionContext: params.actionContext || "NAVIGATION",
      })
    );

    // 2. Full Page Load Duration
    records.push(
      this.client.createPerformanceRecord({
        missionId: params.missionId,
        runId: params.runId,
        page: params.page,
        url: params.url,
        metric: "pageLoadDuration",
        value: params.metrics.loadDurationMs,
        unit: "ms",
        threshold: this.thresholds.maxLoadDurationMs,
        actionContext: params.actionContext || "NAVIGATION",
      })
    );

    // 3. First Contentful Paint (if available)
    if (params.metrics.firstContentfulPaintMs !== undefined) {
      records.push(
        this.client.createPerformanceRecord({
          missionId: params.missionId,
          runId: params.runId,
          page: params.page,
          url: params.url,
          metric: "firstContentfulPaint",
          value: params.metrics.firstContentfulPaintMs,
          unit: "ms",
          threshold: this.thresholds.maxFirstContentfulPaintMs,
          actionContext: params.actionContext || "NAVIGATION",
        })
      );
    }

    // 4. JS Heap Size (if available)
    if (params.metrics.jsHeapSizeBytes !== undefined) {
      records.push(
        this.client.createPerformanceRecord({
          missionId: params.missionId,
          runId: params.runId,
          page: params.page,
          url: params.url,
          metric: "jsHeapSize",
          value: params.metrics.jsHeapSizeBytes,
          unit: "bytes",
          threshold: this.thresholds.maxHeapSizeBytes,
          actionContext: params.actionContext || "HEAP_INSPECTION",
        })
      );
    }

    return records;
  }
}
