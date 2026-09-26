export interface Floor03RuntimeInput {
  requestId: string;
  floor02Handoff: Record<string, any>;
  platform?: string;
  aspectRatio?: string;
  targetResolution?: string;
  stylePreset?: string;
  voiceId?: string;
  authorizedOverride?: boolean;
}

export interface Floor03RuntimeResult {
  handoffPayload: Record<string, any>;
  executionReport: Record<string, any>;
}

export class Floor03RuntimeAdapter {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  constructor(
    baseUrl = process.env.FLOOR03_RUNTIME_URL || "",
    apiKey = process.env.FLOOR03_SERVICE_API_KEY || process.env.FLOOR03_API_KEY || "",
    timeoutMs = Number(process.env.FLOOR03_RUNTIME_TIMEOUT_MS || 30000)
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
    this.timeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 30000;
  }

  isConfigured(): boolean {
    return Boolean(this.baseUrl && this.apiKey);
  }

  async plan(input: Floor03RuntimeInput): Promise<Floor03RuntimeResult> {
    if (!this.isConfigured()) {
      throw new Error(
        "[Floor03RuntimeAdapter] Canonical Python Floor 03 runtime is not configured. " +
        "Set FLOOR03_RUNTIME_URL and FLOOR03_SERVICE_API_KEY."
      );
    }

    if (
      input.floor02Handoff.floor_id !== "floor02_scripting" ||
      input.floor02Handoff.handoff_status !== "VALIDATED" ||
      !Array.isArray(input.floor02Handoff.scenes) ||
      !input.floor02Handoff.script_ir
    ) {
      throw new Error(
        "[Floor03RuntimeAdapter] Refusing non-canonical or unvalidated Floor 02 handoff."
      );
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    const payload = {
      request_id: input.requestId,
      floor02_payload: input.floor02Handoff,
      platform: input.platform,
      aspect_ratio: input.aspectRatio,
      target_resolution: input.targetResolution,
      style_preset: input.stylePreset,
      voice_id: input.voiceId,
      authorized_override: input.authorizedOverride ?? false,
    };

    try {
      const response = await fetch(`${this.baseUrl}/v1/assets/execution-report`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": this.apiKey,
          "X-FactoryOS-Floor": "floor03_asset_realization",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const raw = await response.text();
      if (!response.ok) {
        throw new Error(
          `[Floor03RuntimeAdapter] Canonical F03 runtime rejected request: HTTP ${response.status}`
        );
      }

      let result: Record<string, any>;
      try {
        result = JSON.parse(raw);
      } catch {
        throw new Error("[Floor03RuntimeAdapter] Canonical F03 runtime returned invalid JSON");
      }

      const handoff = result.handoff_payload;
      const report = result.execution_report;

      if (
        !handoff ||
        handoff.floor_id !== "floor03_asset_realization" ||
        handoff.floor_version !== "2.3.0" ||
        handoff.handoff_status !== "VALIDATED" ||
        !handoff.asset_plan_ir ||
        handoff.asset_plan_ir.schema_version !== "1.4.0" ||
        !handoff.asset_plan_ir.plan_fingerprint ||
        !handoff.asset_plan_ir.source_fingerprint ||
        !handoff.asset_plan_ir.lineage ||
        !Array.isArray(handoff.provenance) ||
        handoff.provenance.length === 0 ||
        !report ||
        report.floor_id !== "floor03_asset_realization"
      ) {
        throw new Error(
          "[Floor03RuntimeAdapter] Canonical F03 runtime returned an invalid or unvalidated handoff."
        );
      }

      return {
        handoffPayload: handoff,
        executionReport: report,
      };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new Error(
          `[Floor03RuntimeAdapter] Canonical F03 runtime timed out after ${this.timeoutMs}ms`
        );
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}
