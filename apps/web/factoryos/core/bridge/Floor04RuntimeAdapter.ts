import { createHash } from "node:crypto";

export interface Floor04PhysicalAsset {
  readonly asset_id: string;
  readonly scene_id: string;
  readonly mime_type: string;
  readonly sha256_checksum: string;
  readonly file_size_bytes: number;
  readonly source_spec_hash: string;
  readonly provenance_hash: string;
  readonly width?: number;
  readonly height?: number;
  readonly duration_seconds?: number;
  readonly sample_rate_hz?: number;
  readonly rights_metadata?: Readonly<Record<string, unknown>>;
  readonly provider_execution?: Readonly<Record<string, unknown>>;
}

export interface Floor04MediaHandoff {
  readonly request_id: string;
  readonly source_asset_plan_fingerprint: string;
  readonly synthesized_visual_assets: readonly Floor04PhysicalAsset[];
  readonly synthesized_audio_assets: readonly Floor04PhysicalAsset[];
  readonly background_audio_asset?: Floor04PhysicalAsset | null;
  readonly provenance_hash: string;
  readonly media_manifest: Readonly<Record<string, unknown>>;
  readonly [key: string]: unknown;
}

export interface Floor04ExecutionResponse {
  readonly handoff_payload: Floor04MediaHandoff;
  readonly execution_report: {
    readonly status: string;
    readonly request_id: string;
    readonly execution_id: string;
    readonly floor_id: string;
    readonly warnings?: readonly string[];
    readonly errors?: readonly string[];
  };
}

const SHA256_RE = /^[a-f0-9]{64}$/i;
const MAX_ASSET_BYTES = 100 * 1024 * 1024;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function nonEmpty(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

/**
 * Authenticated bridge to canonical Python F04. The service response carries
 * metadata only; source bytes are obtained via the separately authenticated
 * asset endpoint and must match physical SHA-256 and length evidence.
 */
export class Floor04RuntimeAdapter {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;

  constructor(
    baseUrl = process.env.FLOOR04_RUNTIME_URL || "",
    apiKey = process.env.FLOOR04_SERVICE_API_KEY || "",
    timeoutMs = Number(process.env.FLOOR04_RUNTIME_TIMEOUT_MS || 180_000),
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.apiKey = apiKey;
    this.timeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 180_000;
  }

  isConfigured(): boolean {
    return Boolean(this.baseUrl && this.apiKey);
  }

  private validateBaseUrl(): void {
    let parsed: URL;
    try {
      parsed = new URL(this.baseUrl);
    } catch {
      throw new Error("[Floor04RuntimeAdapter] FLOOR04_RUNTIME_URL is not a valid URL.");
    }
    const localHttp =
      parsed.protocol === "http:" &&
      process.env.NODE_ENV !== "production" &&
      (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "::1");
    if (parsed.protocol !== "https:" && !localHttp) {
      throw new Error("[Floor04RuntimeAdapter] F04 service URL must use HTTPS (HTTP only for local development).");
    }
    if (parsed.username || parsed.password) {
      throw new Error("[Floor04RuntimeAdapter] Credentials must not be embedded in the F04 service URL.");
    }
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("[Floor04RuntimeAdapter] F04 request timed out after " + this.timeoutMs + "ms.");
      }
      throw new Error("[Floor04RuntimeAdapter] F04 runtime request failed.");
    } finally {
      clearTimeout(timeout);
    }
  }

  async execute(input: {
    readonly request_id: string;
    readonly floor03_payload: Record<string, unknown>;
    readonly execution_mode?: "HYBRID" | "DETERMINISTIC_FALLBACK";
  }): Promise<Floor04ExecutionResponse> {
    if (!this.isConfigured()) {
      throw new Error("[Floor04RuntimeAdapter] Set FLOOR04_RUNTIME_URL and FLOOR04_SERVICE_API_KEY.");
    }
    this.validateBaseUrl();
    if (!input.request_id.trim()) throw new Error("[Floor04RuntimeAdapter] Request identity is required.");

    const sourcePlan = record(input.floor03_payload.asset_plan_ir);
    const expectedFingerprint =
      nonEmpty(sourcePlan?.plan_fingerprint) || nonEmpty(sourcePlan?.source_fingerprint);
    if (!expectedFingerprint) {
      throw new Error("[Floor04RuntimeAdapter] Canonical F03 AssetPlanIR fingerprint is missing.");
    }

    const response = await this.fetchWithTimeout(this.baseUrl + "/v1/media/execution-report", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": this.apiKey,
      },
      body: JSON.stringify({
        request_id: input.request_id,
        floor03_payload: input.floor03_payload,
        execution_mode: input.execution_mode || "HYBRID",
      }),
    });
    if (!response.ok) {
      throw new Error("[Floor04RuntimeAdapter] F04 rejected execution with HTTP " + response.status + ".");
    }

    let body: Record<string, unknown> | null;
    try {
      body = record(await response.json());
    } catch {
      throw new Error("[Floor04RuntimeAdapter] F04 returned invalid JSON.");
    }
    const handoff = record(body?.handoff_payload);
    const executionReport = record(body?.execution_report);
    if (!handoff || !executionReport) {
      throw new Error("[Floor04RuntimeAdapter] F04 response omitted its handoff or execution report.");
    }
    if (
      executionReport.status !== "COMPLETED" ||
      executionReport.request_id !== input.request_id ||
      handoff.request_id !== input.request_id ||
      handoff.source_asset_plan_fingerprint !== expectedFingerprint ||
      !Array.isArray(handoff.synthesized_visual_assets) ||
      !Array.isArray(handoff.synthesized_audio_assets)
    ) {
      throw new Error("[Floor04RuntimeAdapter] F04 response failed execution, request, or lineage validation.");
    }

    const expectedVisualIds = new Set(
      (Array.isArray(input.floor03_payload.visual_asset_requirements)
        ? input.floor03_payload.visual_asset_requirements
        : [])
        .map((item) => nonEmpty(record(item)?.asset_id))
        .filter((value): value is string => Boolean(value)),
    );
    const expectedAudioIds = new Set(
      (Array.isArray(input.floor03_payload.audio_asset_requirements)
        ? input.floor03_payload.audio_asset_requirements
        : [])
        .map((item) => nonEmpty(record(item)?.asset_id))
        .filter((value): value is string => Boolean(value)),
    );

    const validateAssets = (
      rawAssets: unknown[],
      expectedIds: Set<string>,
      role: "VISUAL" | "AUDIO",
    ): Floor04PhysicalAsset[] => {
      const parsed = rawAssets.map((value) => record(value));
      if (parsed.some((value) => !value)) {
        throw new Error("[Floor04RuntimeAdapter] F04 returned malformed " + role.toLowerCase() + " asset metadata.");
      }
      const assets = parsed as Record<string, unknown>[];
      const ids = new Set<string>();
      for (const asset of assets) {
        const id = nonEmpty(asset.asset_id);
        const mime = nonEmpty(asset.mime_type);
        const digest = nonEmpty(asset.sha256_checksum);
        const size = asset.file_size_bytes;
        if (
          !id ||
          ids.has(id) ||
          !mime ||
          !digest ||
          !SHA256_RE.test(digest) ||
          !positiveInteger(size) ||
          size > MAX_ASSET_BYTES ||
          asset.source_spec_hash !== expectedFingerprint ||
          (role === "VISUAL" ? !mime.startsWith("image/") : !mime.startsWith("audio/"))
        ) {
          throw new Error("[Floor04RuntimeAdapter] F04 returned untrusted " + role.toLowerCase() + " artifact metadata.");
        }
        ids.add(id);
      }
      if (ids.size !== expectedIds.size || [...expectedIds].some((id) => !ids.has(id))) {
        throw new Error("[Floor04RuntimeAdapter] F04 returned an incomplete " + role.toLowerCase() + " source set.");
      }
      return assets as unknown as Floor04PhysicalAsset[];
    };

    const normalizedHandoff = {
      ...handoff,
      synthesized_visual_assets: validateAssets(
        handoff.synthesized_visual_assets as unknown[],
        expectedVisualIds,
        "VISUAL",
      ),
      synthesized_audio_assets: validateAssets(
        handoff.synthesized_audio_assets as unknown[],
        expectedAudioIds,
        "AUDIO",
      ),
    } as unknown as Floor04MediaHandoff;

    if (normalizedHandoff.background_audio_asset) {
      const bg = record(normalizedHandoff.background_audio_asset);
      if (
        !bg ||
        !nonEmpty(bg.asset_id) ||
        !nonEmpty(bg.mime_type)?.startsWith("audio/") ||
        !SHA256_RE.test(nonEmpty(bg.sha256_checksum) || "") ||
        !positiveInteger(bg.file_size_bytes) ||
        Number(bg.file_size_bytes) > MAX_ASSET_BYTES ||
        bg.source_spec_hash !== expectedFingerprint
      ) {
        throw new Error("[Floor04RuntimeAdapter] F04 returned untrusted background-audio metadata.");
      }
    }

    return {
      handoff_payload: normalizedHandoff,
      execution_report: executionReport as unknown as Floor04ExecutionResponse["execution_report"],
    };
  }

  async downloadAsset(asset: Floor04PhysicalAsset, requestId: string): Promise<Buffer> {
    if (!this.isConfigured()) {
      throw new Error("[Floor04RuntimeAdapter] Set FLOOR04_RUNTIME_URL and FLOOR04_SERVICE_API_KEY.");
    }
    this.validateBaseUrl();
    if (!asset.asset_id || !SHA256_RE.test(asset.sha256_checksum) || !positiveInteger(asset.file_size_bytes)) {
      throw new Error("[Floor04RuntimeAdapter] Asset download requires verified identity, digest, and length.");
    }
    if (asset.file_size_bytes > MAX_ASSET_BYTES) {
      throw new Error("[Floor04RuntimeAdapter] Source asset exceeds the configured download limit.");
    }

    const url = new URL(
      this.baseUrl + "/v1/media/assets/" + encodeURIComponent(asset.asset_id) + "/content",
    );
    url.searchParams.set("request_id", requestId);
    url.searchParams.set("sha256", asset.sha256_checksum.toLowerCase());

    const response = await this.fetchWithTimeout(url.toString(), {
      method: "GET",
      headers: { "X-API-Key": this.apiKey },
    });
    if (!response.ok) {
      throw new Error("[Floor04RuntimeAdapter] F04 asset retrieval failed with HTTP " + response.status + ".");
    }
    const returnedDigest = response.headers.get("x-content-sha256")?.toLowerCase();
    const returnedSourceHash = response.headers.get("x-source-spec-hash")?.toLowerCase();
    const returnedType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    if (
      returnedDigest !== asset.sha256_checksum.toLowerCase() ||
      returnedSourceHash !== asset.source_spec_hash.toLowerCase() ||
      returnedType !== asset.mime_type.toLowerCase()
    ) {
      throw new Error("[Floor04RuntimeAdapter] F04 asset headers do not match the validated handoff.");
    }
    const declaredLength = Number(response.headers.get("x-asset-byte-length") || asset.file_size_bytes);
    if (declaredLength !== asset.file_size_bytes) {
      throw new Error("[Floor04RuntimeAdapter] F04 asset length header does not match the validated handoff.");
    }

    let bytes: Buffer;
    try {
      bytes = Buffer.from(await response.arrayBuffer());
    } catch {
      throw new Error("[Floor04RuntimeAdapter] F04 asset body could not be read.");
    }
    if (bytes.byteLength !== asset.file_size_bytes) {
      throw new Error("[Floor04RuntimeAdapter] F04 asset byte length does not match the validated handoff.");
    }
    const actualDigest = createHash("sha256").update(bytes).digest("hex");
    if (actualDigest !== asset.sha256_checksum.toLowerCase()) {
      throw new Error("[Floor04RuntimeAdapter] F04 asset bytes failed SHA-256 verification.");
    }
    return bytes;
  }
}
