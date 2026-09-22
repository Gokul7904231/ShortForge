import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import type { SituationEvidenceRef } from "../model/SituationRecord";
import type {
  BrowserEvidenceRecord,
  BrowserEvidenceKind,
  ConsoleEvidenceMetadata,
  NetworkEvidenceMetadata,
  DomStateEvidenceMetadata,
  ScreenshotEvidenceMetadata,
  PerformanceEvidenceMetadata,
  BrowserRunRecord,
  BrowserEvaluationStatus,
  BrowserExecutionMode,
} from "../contracts/browser.contract";
import { BrowserRedactor } from "./BrowserRedactor";

export interface CDPAvailability {
  readonly isAvailable: boolean;
  readonly browserVersion?: string;
  readonly protocolVersion?: string;
  readonly webSocketDebuggerUrl?: string;
  readonly reason?: string;
}

export class ChromeDevToolsClient {
  private readonly endpoint: string;

  constructor(endpoint: string = "http://127.0.0.1:9222") {
    // Strict security boundary: only allow localhost loopback
    if (!endpoint.includes("127.0.0.1") && !endpoint.includes("localhost")) {
      throw new Error(`[SecurityBoundaryViolation] ChromeDevToolsClient only permitted on local loopback. Provided: ${endpoint}`);
    }
    this.endpoint = endpoint;
  }

  public getEndpoint(): string {
    return this.endpoint;
  }

  public async checkAvailability(): Promise<CDPAvailability> {
    try {
      const res = await fetch(`${this.endpoint}/json/version`, { signal: AbortSignal.timeout(1500) });
      if (res.ok) {
        const info = (await res.json()) as Record<string, string>;
        return {
          isAvailable: true,
          browserVersion: info["Browser"],
          protocolVersion: info["Protocol-Version"],
          webSocketDebuggerUrl: info["webSocketDebuggerUrl"],
        };
      }
      return {
        isAvailable: false,
        reason: `CDP returned HTTP status ${res.status}`,
      };
    } catch (err: any) {
      return {
        isAvailable: false,
        reason: `${this.endpoint} unavailable (${err.message || "Connection refused"})`,
      };
    }
  }

  public createConsoleRecord(params: {
    missionId: string;
    runId: string;
    page: string;
    url: string;
    level: "log" | "info" | "warning" | "error" | "debug";
    text: string;
    source?: string;
    stackTrace?: string;
    actionContext?: string;
    requestId?: string;
  }): BrowserEvidenceRecord {
    const id = `ev_browser_console_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const metadata: ConsoleEvidenceMetadata = {
      level: params.level,
      text: BrowserRedactor.redactText(params.text),
      source: params.source,
      stackTrace: params.stackTrace ? BrowserRedactor.redactText(params.stackTrace) : undefined,
    };

    return {
      id,
      missionId: params.missionId,
      runId: params.runId,
      kind: "CONSOLE",
      truthLevel: "OBSERVED",
      timestamp: new Date().toISOString(),
      page: params.page,
      url: BrowserRedactor.redactUrl(params.url),
      actionContext: params.actionContext,
      source: {
        tool: "ChromeDevToolsClient",
        requestId: params.requestId,
      },
      metadata,
    };
  }

  public createNetworkRecord(params: {
    missionId: string;
    runId: string;
    page: string;
    url: string;
    method: string;
    statusCode: number;
    timingMs?: number;
    requestId?: string;
    failureReason?: string;
    headers?: Record<string, string>;
    actionContext?: string;
  }): BrowserEvidenceRecord {
    const id = `ev_browser_net_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const isFailure = params.statusCode >= 400 || !!params.failureReason;
    const metadata: NetworkEvidenceMetadata = {
      url: BrowserRedactor.redactUrl(params.url),
      method: params.method.toUpperCase(),
      statusCode: params.statusCode,
      timingMs: params.timingMs,
      requestId: params.requestId,
      failureReason: params.failureReason,
      sanitizedHeaders: BrowserRedactor.redactHeaders(params.headers),
      isFailure,
    };

    return {
      id,
      missionId: params.missionId,
      runId: params.runId,
      kind: "NETWORK",
      truthLevel: "OBSERVED",
      timestamp: new Date().toISOString(),
      page: params.page,
      url: BrowserRedactor.redactUrl(params.url),
      actionContext: params.actionContext,
      source: {
        tool: "ChromeDevToolsClient",
        requestId: params.requestId,
      },
      metadata,
    };
  }

  public createDomStateRecord(params: {
    missionId: string;
    runId: string;
    page: string;
    url: string;
    selector: string;
    visible: boolean;
    text?: string;
    enabled?: boolean;
    role?: string;
    attributes?: Record<string, string>;
    actionContext?: string;
  }): BrowserEvidenceRecord {
    const id = `ev_browser_dom_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const metadata: DomStateEvidenceMetadata = {
      selector: params.selector,
      text: params.text ? BrowserRedactor.redactText(params.text) : undefined,
      visible: params.visible,
      enabled: params.enabled,
      role: params.role,
      attributes: params.attributes,
    };

    return {
      id,
      missionId: params.missionId,
      runId: params.runId,
      kind: "DOM_STATE",
      truthLevel: "OBSERVED",
      timestamp: new Date().toISOString(),
      page: params.page,
      url: BrowserRedactor.redactUrl(params.url),
      actionContext: params.actionContext,
      source: {
        tool: "ChromeDevToolsClient",
      },
      metadata,
    };
  }

  public createScreenshotRecord(params: {
    missionId: string;
    runId: string;
    page: string;
    url: string;
    base64Data?: string;
    buffer?: Buffer;
    destinationDir?: string;
    actionContext?: string;
    width?: number;
    height?: number;
  }): BrowserEvidenceRecord {
    const id = `ev_browser_shot_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const destDir = params.destinationDir || path.resolve(process.cwd(), "data", "evidence", "screenshots");
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    const filename = `${params.runId}_${id}.png`;
    const fullPath = path.join(destDir, filename);

    let byteLength = 0;
    let sha256 = "";

    if (params.buffer) {
      fs.writeFileSync(fullPath, params.buffer);
      byteLength = params.buffer.length;
      sha256 = crypto.createHash("sha256").update(params.buffer).digest("hex");
    } else if (params.base64Data) {
      const buf = Buffer.from(params.base64Data, "base64");
      fs.writeFileSync(fullPath, buf);
      byteLength = buf.length;
      sha256 = crypto.createHash("sha256").update(buf).digest("hex");
    }

    const metadata: ScreenshotEvidenceMetadata = {
      localPath: fullPath,
      mimeType: "image/png",
      byteLength,
      sha256,
      width: params.width || 1280,
      height: params.height || 720,
    };

    return {
      id,
      missionId: params.missionId,
      runId: params.runId,
      kind: "SCREENSHOT",
      truthLevel: "OBSERVED",
      timestamp: new Date().toISOString(),
      page: params.page,
      url: BrowserRedactor.redactUrl(params.url),
      actionContext: params.actionContext,
      source: {
        tool: "ChromeDevToolsClient",
      },
      payloadRef: fullPath,
      metadata,
    };
  }

  public createPerformanceRecord(params: {
    missionId: string;
    runId: string;
    page: string;
    url: string;
    metric: string;
    value: number;
    unit: "ms" | "bytes" | "fps" | "score";
    threshold?: number;
    actionContext?: string;
    rawTraceRef?: string;
  }): BrowserEvidenceRecord {
    const id = `ev_browser_perf_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const thresholdExceeded = params.threshold !== undefined ? params.value > params.threshold : false;

    const metadata: PerformanceEvidenceMetadata = {
      metric: params.metric,
      value: params.value,
      unit: params.unit,
      threshold: params.threshold,
      thresholdExceeded,
      rawTraceRef: params.rawTraceRef,
    };

    return {
      id,
      missionId: params.missionId,
      runId: params.runId,
      kind: "PERFORMANCE",
      truthLevel: "OBSERVED",
      timestamp: new Date().toISOString(),
      page: params.page,
      url: BrowserRedactor.redactUrl(params.url),
      actionContext: params.actionContext,
      source: {
        tool: "ChromeDevToolsClient",
      },
      payloadRef: params.rawTraceRef,
      metadata,
    };
  }

  public static toEvidenceRef(record: BrowserEvidenceRecord): SituationEvidenceRef {
    let description = `[${record.kind}] on ${record.url}`;
    if (record.kind === "CONSOLE") {
      const meta = record.metadata as ConsoleEvidenceMetadata;
      description = `Console ${meta.level.toUpperCase()}: ${meta.text}`;
    } else if (record.kind === "NETWORK") {
      const meta = record.metadata as NetworkEvidenceMetadata;
      description = `HTTP ${meta.method} ${meta.url} -> ${meta.statusCode}`;
    } else if (record.kind === "DOM_STATE") {
      const meta = record.metadata as DomStateEvidenceMetadata;
      description = `DOM '${meta.selector}' (visible: ${meta.visible})`;
    } else if (record.kind === "SCREENSHOT") {
      const meta = record.metadata as ScreenshotEvidenceMetadata;
      description = `Screenshot captured: ${path.basename(meta.localPath)} (${meta.byteLength} bytes)`;
    } else if (record.kind === "PERFORMANCE") {
      const meta = record.metadata as PerformanceEvidenceMetadata;
      description = `Performance ${meta.metric}: ${meta.value}${meta.unit}`;
    }

    return {
      evidenceId: record.id,
      type: "BROWSER_OBSERVATION",
      truthLevel: record.truthLevel,
      digest: (record.metadata as ScreenshotEvidenceMetadata).sha256,
      uriOrPath: record.payloadRef || (record.metadata as ScreenshotEvidenceMetadata).localPath,
      description,
    };
  }
}
