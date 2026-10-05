import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  ExternalApiQualificationProfile,
  QualificationHttpObservation,
} from "./ExternalApiQualificationContracts";
import {
} from "./ExternalApiQualificationContracts";
import { PerplexityMcpClient } from "./PerplexityMcpClient";

const execFileAsync = promisify(execFile);

const VIDEO_ID = "aHhB3sjGjkI";
const TRANSCRIPT_VIDEO_URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const UNPAYWALL_DOI = "10.1038/nature12373";

const PROFILES: readonly ExternalApiQualificationProfile[] = [
  { providerId: "openalex", probeKind: "JSON_GET", credentialEnvs: [], metered: false, destructive: false, defaultEnabled: false, capability: "ACADEMIC_RESEARCH", endpointDescription: "GET /works with one bounded search result", notes: "Public metadata discovery; no secret required." },
  { providerId: "arxiv", probeKind: "JSON_GET", credentialEnvs: [], metered: false, destructive: false, defaultEnabled: false, capability: "ACADEMIC_RESEARCH", endpointDescription: "GET /api/query with one result", notes: "Public Atom research discovery." },
  { providerId: "semantic_scholar", probeKind: "JSON_GET", credentialEnvs: ["SEMANTIC_SCHOLAR_API_KEY"], metered: false, destructive: false, defaultEnabled: false, capability: "ACADEMIC_RESEARCH", endpointDescription: "GET /paper/search", notes: "API key is optional on some public traffic; configured credentials are server-side." },
  { providerId: "crossref", probeKind: "JSON_GET", credentialEnvs: [], metered: false, destructive: false, defaultEnabled: false, capability: "ACADEMIC_RESEARCH", endpointDescription: "GET /works with polite mailto when configured", notes: "Public metadata; CROSSREF_MAILTO is recommended." },
  { providerId: "unpaywall", probeKind: "JSON_GET", credentialEnvs: ["UNPAYWALL_EMAIL"], metered: false, destructive: false, defaultEnabled: false, capability: "ACADEMIC_RESEARCH", endpointDescription: "GET /v2/{doi}?email=", notes: "DOI-scoped lookup; no broad search probe." },
  { providerId: "perplexity_mcp", probeKind: "MCP", credentialEnvs: ["PERPLEXITY_API_KEY"], metered: true, destructive: false, defaultEnabled: false, capability: "WEB_RESEARCH + MCP_TOOLS", endpointDescription: "MCP initialize + tools/list", notes: "Metered remote MCP; tool surface only." },

  { providerId: "pexels", probeKind: "JSON_GET", credentialEnvs: ["PEXELS_API_KEY"], metered: false, destructive: false, defaultEnabled: false, capability: "VISUAL_ASSET_SEARCH", endpointDescription: "GET /v1/search", notes: "Search capability is verified first; representative download is required before final material qualification." },
  { providerId: "pixabay", probeKind: "JSON_GET", credentialEnvs: ["PIXABAY_API_KEY"], metered: false, destructive: false, defaultEnabled: false, capability: "VISUAL_ASSET_SEARCH", endpointDescription: "GET /api with one photo result", notes: "Provider search plus optional representative materialization." },
  { providerId: "pexafy", probeKind: "JSON_GET", credentialEnvs: ["PEXAFY_API_KEY"], metered: false, destructive: false, defaultEnabled: false, capability: "VISUAL_ASSET_SEARCH", endpointDescription: "GET /api/v1/search/photos", notes: "Semantic search plus optional representative materialization." },

  { providerId: "arcmira", probeKind: "JSON_GET", credentialEnvs: ["ARCMIRA_API_KEY"], metered: false, destructive: false, defaultEnabled: false, capability: "VIDEO_RESEARCH", endpointDescription: "GET /v1/transcripts/{videoId}", notes: "Timestamped transcript capability." },
  { providerId: "transcriptyt", probeKind: "JSON_GET", credentialEnvs: ["TRANSCRIPT_YT_API_KEY"], metered: false, destructive: false, defaultEnabled: false, capability: "VIDEO_RESEARCH", endpointDescription: "GET /api/v1/transcript", notes: "Timestamped transcript capability." },
  { providerId: "vidwords", probeKind: "JSON_POST", credentialEnvs: ["VIDWORDS_API_KEY"], metered: false, destructive: false, defaultEnabled: false, capability: "VIDEO_RESEARCH", endpointDescription: "POST /api/transcripts", notes: "Basic-auth timestamped transcript capability." },
  { providerId: "tubetotranscript", probeKind: "JSON_GET", credentialEnvs: ["TUBETOTRANSCRIPT_API_KEY"], metered: false, destructive: false, defaultEnabled: false, capability: "VIDEO_RESEARCH", endpointDescription: "GET /api/v1/transcript", notes: "Bearer-auth timestamped transcript capability." },
  { providerId: "youtube_data_api", probeKind: "JSON_GET", credentialEnvs: ["YOUTUBE_API_KEY"], metered: false, destructive: false, defaultEnabled: false, capability: "VIDEO_RESEARCH", endpointDescription: "GET /youtube/v3/search", notes: "Metadata/search only; quota-governed." },

  { providerId: "gemini", probeKind: "JSON_GET", credentialEnvs: ["GEMINI_API_KEY"], metered: true, destructive: false, defaultEnabled: false, capability: "LLM_INFERENCE", endpointDescription: "GET /v1beta/models", notes: "Safe metadata probe; inference qualification is an explicit metered capability step." },
  { providerId: "groq", probeKind: "JSON_GET", credentialEnvs: ["GROQ_API_KEY"], metered: true, destructive: false, defaultEnabled: false, capability: "LLM_INFERENCE", endpointDescription: "GET /openai/v1/models", notes: "Safe metadata probe; no inference spending in default mode." },
  { providerId: "openrouter", probeKind: "JSON_GET", credentialEnvs: ["OPENROUTER_API_KEY"], metered: true, destructive: false, defaultEnabled: false, capability: "LLM_INFERENCE", endpointDescription: "GET /api/v1/models", notes: "Safe metadata probe; no inference spending in default mode." },
  { providerId: "huggingface", probeKind: "JSON_GET", credentialEnvs: ["HF_API_KEY", "HF_TOKEN"], metered: true, destructive: false, defaultEnabled: false, capability: "LLM_INFERENCE", endpointDescription: "GET /v1/models", notes: "At least one configured token is required; no inference spending in default mode." },

  { providerId: "ibm_tts", probeKind: "BINARY_POST", credentialEnvs: ["IBM_TTS_API_KEY", "IBM_TTS_URL"], metered: true, destructive: false, defaultEnabled: false, capability: "TTS", endpointDescription: "POST {instance}/v1/synthesize", notes: "Instance/region URL is mandatory; returned bytes are physically hashed and ffprobe-checked." },
  { providerId: "audexum", probeKind: "BINARY_POST", credentialEnvs: ["AUDEXUM_API_KEY"], metered: true, destructive: false, defaultEnabled: false, capability: "TTS", endpointDescription: "POST /api/synthesize", notes: "Metered audio synthesis; explicit opt-in required." },
  { providerId: "speak_ai", probeKind: "JSON_POST", credentialEnvs: ["SPEAK_AI_API_KEY"], metered: false, destructive: false, defaultEnabled: false, capability: "VIDEO_RESEARCH", endpointDescription: "POST /v1/auth/accessToken then GET media", notes: "API-key/access-token flow; analysis/transcript only, not TTS." },
  { providerId: "freesound", probeKind: "JSON_GET", credentialEnvs: ["FREESOUND_API_KEY"], metered: false, destructive: false, defaultEnabled: false, capability: "AUDIO_ASSET_SEARCH", endpointDescription: "GET /apiv2/search/text", notes: "Token-authenticated sound search." },

  { providerId: "ocr_space", probeKind: "JSON_POST", credentialEnvs: ["OCR_SPACE_API_KEY"], metered: false, destructive: false, defaultEnabled: false, capability: "DOCUMENT_OCR", endpointDescription: "POST /parse/image using a public test image URL", notes: "No secrets in provider payload; small representative OCR." },
  { providerId: "perspective", probeKind: "JSON_POST", credentialEnvs: ["PERSPECTIVE_API_KEY"], metered: false, destructive: false, defaultEnabled: false, capability: "SAFETY_CHECK", endpointDescription: "POST v1alpha1/comments:analyze", notes: "Advisory toxicity score only." },
  { providerId: "google_safe_browsing", probeKind: "JSON_POST", credentialEnvs: ["SAFE_BROWSING_API_KEY"], metered: false, destructive: false, defaultEnabled: false, capability: "SAFETY_CHECK", endpointDescription: "POST v4/threatMatches:find", notes: "Requires explicit non-commercial confirmation." },
  { providerId: "urlscan", probeKind: "JSON_POST", credentialEnvs: ["URLSCAN_API_KEY"], metered: false, destructive: true, defaultEnabled: false, capability: "SAFETY_CHECK + WEB_RESEARCH", endpointDescription: "POST /api/v1/scan with private visibility", notes: "Creates a real scan; explicit destructive/live authorization required." },

  { providerId: "open_meteo", probeKind: "JSON_GET", credentialEnvs: [], metered: false, destructive: false, defaultEnabled: false, capability: "GEO_CONTEXT", endpointDescription: "GET /v1/forecast for one coordinate", notes: "Public forecast endpoint." },
  { providerId: "nominatim", probeKind: "JSON_GET", credentialEnvs: ["NOMINATIM_USER_AGENT"], metered: false, destructive: false, defaultEnabled: false, capability: "GEO_CONTEXT", endpointDescription: "GET /search with one query", notes: "Public service; strict identifying User-Agent and one-request-per-second policy apply." },
];

export function externalApiQualificationProfiles(): readonly ExternalApiQualificationProfile[] {
  return PROFILES;
}

export function getExternalApiQualificationProfile(
  providerId: string,
): ExternalApiQualificationProfile | undefined {
  return PROFILES.find((profile) => profile.providerId === providerId);
}

export function configured(profile: ExternalApiQualificationProfile): {
  readonly configured: boolean;
  readonly missing: readonly string[];
} {
  const missing: string[] = [];
  for (const env of profile.credentialEnvs) {
    if (profile.providerId === "huggingface" && (env === "HF_API_KEY" || env === "HF_TOKEN")) {
      if (process.env.HF_API_KEY?.trim() || process.env.HF_TOKEN?.trim()) continue;
    }
    if (!process.env[env]?.trim()) missing.push(env);
  }
  if (profile.providerId === "google_safe_browsing" && process.env.SAFE_BROWSING_NONCOMMERCIAL_CONFIRMED !== "true") {
    missing.push("SAFE_BROWSING_NONCOMMERCIAL_CONFIRMED=true");
  }
  return { configured: missing.length === 0, missing };
}

function authHeaders(providerId: string, secret?: string): Record<string, string> {
  if (!secret) return { Accept: "application/json" };
  if (providerId === "freesound") return { Accept: "application/json" };
  if (providerId === "vidwords") return {
    Accept: "application/json",
    Authorization: "Basic " + Buffer.from(secret + ":").toString("base64"),
  };
  if (providerId === "ibm_tts") return {
    Accept: "audio/wav, application/json",
    Authorization: "Basic " + Buffer.from("apikey:" + secret).toString("base64"),
  };
  if (providerId === "speak_ai") return { Accept: "application/json" };
  return {
    Accept: "application/json",
    Authorization: "Bearer " + secret,
  };
}

function currentBase(providerId: string): string {
  switch (providerId) {
    case "openalex": return "https://api.openalex.org";
    case "arxiv": return "https://export.arxiv.org/api";
    case "semantic_scholar": return "https://api.semanticscholar.org/graph/v1";
    case "crossref": return "https://api.crossref.org";
    case "unpaywall": return "https://api.unpaywall.org/v2";
    case "pexels": return "https://api.pexels.com/v1";
    case "pixabay": return "https://pixabay.com/api/";
    case "pexafy": return "https://api.pexafy.com/api/v1";
    case "arcmira": return "https://api.arcmira.com/v1";
    case "transcriptyt": return "https://transcript-yt.com";
    case "vidwords": return "https://vidwords.com";
    case "tubetotranscript": return "https://www.tubetotranscript.com/api/v1";
    case "youtube_data_api": return "https://www.googleapis.com/youtube/v3";
    case "gemini": return "https://generativelanguage.googleapis.com/v1beta";
    case "groq": return "https://api.groq.com/openai/v1";
    case "openrouter": return "https://openrouter.ai/api/v1";
    case "huggingface": return process.env.HF_INFERENCE_BASE_URL?.trim() || "https://router.huggingface.co/v1";
    case "ibm_tts": return process.env.IBM_TTS_URL?.trim() || "";
    case "audexum": return process.env.AUDEXUM_BASE_URL?.trim() || "https://audexum.com/api";
    case "speak_ai": return process.env.SPEAK_AI_BASE_URL?.trim() || "https://api.speakai.co/v1";
    case "freesound": return process.env.FREESOUND_BASE_URL?.trim() || "https://freesound.org/apiv2";
    case "ocr_space": return "https://api.ocr.space";
    case "perspective": return "https://commentanalyzer.googleapis.com/v1alpha1";
    case "google_safe_browsing": return "https://safebrowsing.googleapis.com/v4";
    case "urlscan": return "https://urlscan.io";
    case "open_meteo": return process.env.OPEN_METEO_BASE_URL?.trim() || "https://api.open-meteo.com/v1";
    case "nominatim": return process.env.NOMINATIM_BASE_URL?.trim() || "https://nominatim.openstreetmap.org";
    case "perplexity_mcp": return process.env.PERPLEXITY_MCP_URL?.trim() || "https://api.perplexity.ai/mcp";
    default: throw new Error("Unknown provider: " + providerId);
  }
}

function requestHeadersFor(
  providerId: string,
  secret?: string,
): Record<string, string> {
  if (providerId === "pexels") return { Authorization: secret || "", Accept: "application/json" };
  if (providerId === "pixabay") return { Accept: "application/json" };
  if (providerId === "pexafy") return { "x-api-key": secret || "", Accept: "application/json" };
  if (providerId === "freesound") return { Accept: "application/json" };
  if (providerId === "nominatim") {
    return {
      Accept: "application/json",
      "User-Agent": process.env.NOMINATIM_USER_AGENT || "",
      ...(process.env.NOMINATIM_REFERER?.trim() ? { Referer: process.env.NOMINATIM_REFERER.trim() } : {}),
    };
  }
  if (providerId === "perspective") return { "Content-Type": "application/json", Accept: "application/json" };
  if (providerId === "google_safe_browsing") return { "Content-Type": "application/json", Accept: "application/json" };
  if (providerId === "urlscan") return { "Content-Type": "application/json", Accept: "application/json", "api-key": secret || "" };
  if (providerId === "speak_ai") return { "Content-Type": "application/json", Accept: "application/json", "x-speakai-key": secret || "" };
  return { "Content-Type": "application/json", ...authHeaders(providerId, secret) };
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return null;
  try { return JSON.parse(text); } catch { return { rawText: text.slice(0, 300) }; }
}

function shapeOf(data: unknown): Record<string, unknown> {
  if (Array.isArray(data)) return { kind: "array", count: data.length };
  if (!data || typeof data !== "object") return { kind: typeof data };
  const object = data as Record<string, unknown>;
  const candidateArrays = ["data", "results", "items", "photos", "hits", "tools", "models", "message"];
  const counts = Object.fromEntries(
    candidateArrays
      .filter((key) => Array.isArray(object[key]))
      .map((key) => [key + "Count", (object[key] as unknown[]).length]),
  );
  return { kind: "object", keys: Object.keys(object).slice(0, 30), ...counts };
}

async function requestJson(
  providerId: string,
  url: URL,
  init: RequestInit,
): Promise<{ data: unknown; observation: QualificationHttpObservation }> {
  const started = Date.now();
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
  const data = await readJson(response);
  const retryAfter = Number(response.headers.get("retry-after") || "");
  return {
    data,
    observation: {
      status: response.status,
      durationMs: Date.now() - started,
      contentType: response.headers.get("content-type") || undefined,
      retryAfterSeconds: Number.isFinite(retryAfter) ? retryAfter : undefined,
      rateLimitLimit: Number(response.headers.get("x-ratelimit-limit") || "") || undefined,
      rateLimitRemaining: Number(response.headers.get("x-ratelimit-remaining") || "") || undefined,
      rateLimitResetEpochSeconds: Number(response.headers.get("x-ratelimit-reset") || "") || undefined,
      requestId: response.headers.get("x-request-id") || undefined,
    },
  };
}

async function requestBinary(
  providerId: string,
  url: URL,
  init: RequestInit,
): Promise<{ bytes: Uint8Array; observation: QualificationHttpObservation }> {
  const started = Date.now();
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) });
  const bytes = new Uint8Array(await response.arrayBuffer());
  const retryAfter = Number(response.headers.get("retry-after") || "");
  const requestId = response.headers.get("x-request-id") || undefined;
  return {
    bytes,
    observation: {
      status: response.status,
      durationMs: Date.now() - started,
      contentType: response.headers.get("content-type") || undefined,
      contentLengthBytes: bytes.byteLength,
      retryAfterSeconds: Number.isFinite(retryAfter) ? retryAfter : undefined,
      requestId,
    },
  };
}

async function materializeVisual(urlValue: string): Promise<Record<string, unknown>> {
  const started = Date.now();
  const response = await fetch(urlValue, {
    headers: { Accept: "image/avif,image/webp,image/jpeg,image/png,*/*" },
    signal: AbortSignal.timeout(20_000),
  });
  const bytes = new Uint8Array(await response.arrayBuffer());
  return {
    status: response.status,
    durationMs: Date.now() - started,
    contentType: response.headers.get("content-type") || undefined,
    byteLength: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    nonEmpty: response.ok && bytes.byteLength > 0,
  };
}

function visualAssetUrl(providerId: string, data: any): string | undefined {
  if (providerId === "pexels") return data?.photos?.[0]?.src?.original;
  if (providerId === "pixabay") return data?.hits?.[0]?.largeImageURL || data?.hits?.[0]?.webformatURL;
  if (providerId === "pexafy") {
    return data?.data?.[0]?.urls?.full ||
      data?.data?.[0]?.urls?.large ||
      data?.data?.[0]?.urls?.regular ||
      data?.data?.[0]?.urls?.small;
  }
  return undefined;
}

async function physicalAudioEvidence(bytes: Uint8Array, contentType?: string): Promise<Record<string, unknown>> {
  const digest = createHash("sha256").update(bytes).digest("hex");
  let durationSeconds: number | undefined;
  let formatName: string | undefined;
  const dir = await mkdtemp(join(tmpdir(), "shortforge-ext-api-"));
  const file = join(dir, "audio.bin");
  try {
    await writeFile(file, bytes);
    const result = await execFileAsync("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration,format_name",
      "-of", "default=noprint_wrappers=1:nokey=0",
      file,
    ]);
    for (const line of result.stdout.split(/\r?\n/)) {
      const [key, value] = line.split("=");
      if (key === "duration" && Number.isFinite(Number(value))) durationSeconds = Number(value);
      if (key === "format_name" && value) formatName = value.trim();
    }
  } catch {
    // Absence of ffprobe is recorded rather than converted into a false physical proof.
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  return {
    byteLength: bytes.byteLength,
    sha256: digest,
    contentType,
    formatName,
    durationSeconds,
    ffprobeVerified: Boolean(formatName && durationSeconds !== undefined),
  };
}

function pickSecret(providerId: string): string | undefined {
  if (providerId === "huggingface") return process.env.HF_TOKEN?.trim() || process.env.HF_API_KEY?.trim();
  return PROFILES.find((profile) => profile.providerId === providerId)?.credentialEnvs
    .map((env) => process.env[env]?.trim())
    .find(Boolean);
}

function capabilityPasses(providerId: string, data: unknown): boolean {
  if (providerId === "perplexity_mcp") return false;
  if (providerId === "speak_ai") {
    const value = data as Record<string, unknown> | null;
    return Boolean(value && (value.accessToken || value.mediaReachable));
  }
  if (providerId === "youtube_data_api") return Boolean((data as any)?.items?.length);
  if (providerId === "arcmira" || providerId === "transcriptyt" || providerId === "tubetotranscript") {
    const value = data as any;
    return Array.isArray(value?.lines) || Array.isArray(value?.transcript) || Array.isArray(value?.segments);
  }
  if (providerId === "vidwords") return Boolean((data as any)?.results?.length || (data as any)?.data?.length);
  if (providerId === "open_meteo") return Boolean((data as any)?.latitude !== undefined && (data as any)?.longitude !== undefined);
  if (providerId === "nominatim") return Array.isArray(data) && data.length > 0;
  if (providerId === "ocr_space") return Boolean((data as any)?.ParsedResults?.length);
  if (providerId === "perspective") return Boolean((data as any)?.attributeScores || (data as any)?.requestedAttributes);
  if (providerId === "google_safe_browsing") return data !== null;
  if (providerId === "urlscan") return Boolean((data as any)?.uuid);
  if (providerId === "gemini" || providerId === "groq" || providerId === "openrouter" || providerId === "huggingface") return false;
  if (providerId === "freesound") return Boolean((data as any)?.results?.length);
  if (providerId === "pexels") return Boolean((data as any)?.photos?.length);
  if (providerId === "pixabay") return Boolean((data as any)?.hits?.length);
  if (providerId === "pexafy") return Boolean((data as any)?.data?.length);
  if (providerId === "openalex") return Boolean((data as any)?.results?.length);
  if (providerId === "arxiv") return typeof data === "object" && data !== null && JSON.stringify(data).includes("<entry>");
  if (providerId === "semantic_scholar") return Boolean((data as any)?.data?.length);
  if (providerId === "crossref") return Boolean((data as any)?.message?.items?.length);
  if (providerId === "unpaywall") return Boolean((data as any)?.doi || (data as any)?.best_oa_location);
  return true;
}

export async function executeProfile(profile: ExternalApiQualificationProfile): Promise<{
  readonly normalized: Record<string, unknown>;
  readonly observation?: QualificationHttpObservation;
  readonly capabilityVerified: boolean;
}> {
  const id = profile.providerId;
  const secret = pickSecret(id);

  if (id === "perplexity_mcp") {
    const client = new PerplexityMcpClient();
    const context = { requestId: "qual_" + randomUUID().slice(0, 12), purpose: "external-api-qualification" };
    const initialized = await client.initialize(context);
    const tools = await client.listTools(context);
    const searchToolPresent = tools.some((tool) => tool.name === "perplexity_search");
    if (!searchToolPresent) {
      return {
        normalized: {
          protocol: "MCP",
          initialized: Boolean(initialized.data),
          toolCount: tools.length,
          toolNames: tools.slice(0, 20).map((tool) => tool.name),
          searchToolPresent: false,
          searchProbe: "UNAVAILABLE",
        },
        observation: {
          status: initialized.status,
          durationMs: initialized.durationMs,
        },
        capabilityVerified: false,
      };
    }

    if (process.env.SHORTFORGE_EXTERNAL_API_PERPLEXITY_SEARCH !== "1") {
      return {
        normalized: {
          protocol: "MCP",
          initialized: Boolean(initialized.data),
          toolCount: tools.length,
          toolNames: tools.slice(0, 20).map((tool) => tool.name),
          searchToolPresent: true,
          searchProbe: "EXPLICIT_SEARCH_PROBE_REQUIRED",
        },
        observation: {
          status: initialized.status,
          durationMs: initialized.durationMs,
        },
        capabilityVerified: false,
      };
    }

    const search = await client.callTool(
      "perplexity_search",
      { query: "ShortForge external API qualification MCP search" },
      context,
    );
    const hasToolError = Boolean(search.data?.isError);
    const searchText = (search.data?.content ?? [])
      .map((item) => item.text ?? "")
      .filter(Boolean)
      .join("\n");

    return {
      normalized: {
        protocol: "MCP",
        initialized: Boolean(initialized.data),
        toolCount: tools.length,
        toolNames: tools.slice(0, 20).map((tool) => tool.name),
        searchToolPresent: true,
        searchProbe: {
          executed: true,
          providerError: hasToolError,
          outputPresent: Boolean(searchText.trim()),
          outputHashPrefix: searchText
            ? createHash("sha256").update(searchText, "utf8").digest("hex").slice(0, 16)
            : undefined,
        },
      },
      observation: {
        status: search.status,
        durationMs: search.durationMs,
        requestId: search.requestId,
      },
      capabilityVerified:
        !hasToolError && Boolean(searchText.trim()),
    };
  }

  if (id === "speak_ai") {
    const base = currentBase(id);
    const auth = await requestJson(id, new URL(base + "/auth/accessToken"), {
      method: "POST",
      headers: requestHeadersFor(id, secret),
      body: JSON.stringify({}),
    });
    if (auth.observation.status < 200 || auth.observation.status >= 300) {
      return { normalized: { auth: "FAILED", response: shapeOf(auth.data) }, observation: auth.observation, capabilityVerified: false };
    }
    const accessToken = String((auth.data as any)?.data?.accessToken || "");
    if (!accessToken) return { normalized: { auth: "NO_ACCESS_TOKEN" }, observation: auth.observation, capabilityVerified: false };
    const media = await requestJson(id, new URL(base + "/media?limit=1"), {
      method: "GET",
      headers: {
        Accept: "application/json",
        "x-speakai-key": secret || "",
        "x-access-token": accessToken,
      },
    });
    return {
      normalized: {
        auth: "PASS",
        media: shapeOf(media.data),
        mediaReachable: media.observation.status >= 200 && media.observation.status < 300,
      },
      observation: media.observation,
      capabilityVerified: media.observation.status >= 200 && media.observation.status < 300,
    };
  }

  if (id === "ibm_tts" || id === "audexum") {
    const endpoint = id === "ibm_tts"
      ? currentBase(id).replace(/\/+$/, "") + "/v1/synthesize"
      : currentBase(id).replace(/\/+$/, "") + "/synthesize";
    const url = new URL(endpoint);
    const body = id === "ibm_tts"
      ? JSON.stringify({ text: "ShortForge qualification test.", voice: process.env.IBM_TTS_VOICE_ID || "en-US_AllisonV3Voice" })
      : JSON.stringify({ text: "ShortForge qualification test.", voice: process.env.AUDEXUM_VOICE_ID || undefined, lang: process.env.AUDEXUM_LANGUAGE || "en", format: "wav" });
    const result = await requestBinary(id, url, {
      method: "POST",
      headers: {
        ...(id === "ibm_tts"
          ? { "Content-Type": "application/json", Accept: "audio/wav, audio/mpeg, application/json", Authorization: "Basic " + Buffer.from("apikey:" + (secret || "")).toString("base64") }
          : { "Content-Type": "application/json", Accept: "audio/wav, application/json", Authorization: "Bearer " + (secret || "") }),
      },
      body,
    });
    const physical = result.observation.status >= 200 && result.observation.status < 300
      ? await physicalAudioEvidence(result.bytes, result.observation.contentType)
      : { byteLength: result.bytes.byteLength, sha256: createHash("sha256").update(result.bytes).digest("hex"), ffprobeVerified: false };
    return {
      normalized: {
        responseBytes: result.bytes.byteLength,
        physical,
      },
      observation: result.observation,
      capabilityVerified: result.observation.status >= 200 &&
        result.bytes.byteLength > 0 &&
        Boolean(physical.ffprobeVerified),
    };
  }

  if (id === "perspective") {
    const url = new URL(currentBase(id) + "/comments:analyze");
    url.searchParams.set("key", secret || "");
    const result = await requestJson(id, url, {
      method: "POST",
      headers: requestHeadersFor(id, secret),
      body: JSON.stringify({
        comment: { text: "ShortForge qualification test." },
        requestedAttributes: { TOXICITY: {} },
      }),
    });
    return { normalized: shapeOf(result.data), observation: result.observation, capabilityVerified: result.observation.status >= 200 && result.observation.status < 300 && capabilityPasses(id, result.data) };
  }

  if (id === "google_safe_browsing") {
    const url = new URL(currentBase(id) + "/threatMatches:find");
    url.searchParams.set("key", secret || "");
    const result = await requestJson(id, url, {
      method: "POST",
      headers: requestHeadersFor(id, secret),
      body: JSON.stringify({
        client: { clientId: "shortforge", clientVersion: "1.0" },
        threatInfo: {
          threatTypes: ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE", "POTENTIALLY_HARMFUL_APPLICATION"],
          platformTypes: ["ANY_PLATFORM"],
          threatEntryTypes: ["URL"],
          threatEntries: [{ url: "https://example.com" }],
        },
      }),
    });
    return { normalized: shapeOf(result.data), observation: result.observation, capabilityVerified: result.observation.status >= 200 && result.observation.status < 300 && capabilityPasses(id, result.data) };
  }

  if (id === "urlscan") {
    const url = new URL(currentBase(id) + "/api/v1/scan");
    const result = await requestJson(id, url, {
      method: "POST",
      headers: requestHeadersFor(id, secret),
      body: JSON.stringify({
        url: "https://example.com",
        visibility: "private",
        tags: ["shortforge-qualification"],
      }),
    });
    return { normalized: shapeOf(result.data), observation: result.observation, capabilityVerified: result.observation.status >= 200 && result.observation.status < 300 && capabilityPasses(id, result.data) };
  }

  if (id === "gemini" || id === "groq" || id === "openrouter" || id === "huggingface") {
    const models = await requestJson(id, new URL(
      id === "gemini"
        ? currentBase(id) + "/models"
        : currentBase(id) + "/models",
    ), {
      method: "GET",
      headers: requestHeadersFor(id, secret),
    });

    if (process.env.SHORTFORGE_EXTERNAL_API_LLM_PROBE !== "1") {
      return {
        normalized: {
          models: shapeOf(models.data),
          inference: "EXPLICIT_LIVE_INFERENCE_REQUIRED",
        },
        observation: models.observation,
        capabilityVerified: false,
      };
    }

    if (!(models.observation.status >= 200 && models.observation.status < 300)) {
      return {
        normalized: { models: shapeOf(models.data) },
        observation: models.observation,
        capabilityVerified: false,
      };
    }

    const model =
      id === "gemini"
        ? (process.env.GEMINI_MODEL && process.env.GEMINI_MODEL !== "auto"
            ? process.env.GEMINI_MODEL
            : "gemini-3.8-flash")
        : id === "groq"
          ? (process.env.GROQ_MODEL || "llama-3.3-70b-versatile")
          : id === "openrouter"
            ? (process.env.OPENROUTER_MODEL || "openai/gpt-oss-120b")
            : (process.env.HF_MODEL || "openai/gpt-oss-120b:fastest");

    const inferenceUrl = id === "gemini"
      ? new URL(currentBase(id) + "/models/" + encodeURIComponent(model) + ":generateContent")
      : new URL(currentBase(id) + "/chat/completions");

    if (id === "gemini") {
      inferenceUrl.searchParams.set("key", secret || "");
    }

    const inference = await requestJson(id, inferenceUrl, {
      method: "POST",
      headers: requestHeadersFor(id, secret),
      body: JSON.stringify(
        id === "gemini"
          ? { contents: [{ parts: [{ text: "Reply with READY." }] }] }
          : {
              model,
              messages: [{ role: "user", content: "Reply with READY." }],
              max_tokens: 4,
              temperature: 0,
            },
      ),
    });

    const output = id === "gemini"
      ? String((inference.data as any)?.candidates?.[0]?.content?.parts?.[0]?.text || "")
      : String((inference.data as any)?.choices?.[0]?.message?.content || "");

    return {
      normalized: {
        model,
        models: shapeOf(models.data),
        inferenceStatus: inference.observation.status,
        outputPresent: Boolean(output.trim()),
        outputHashPrefix: output
          ? createHash("sha256").update(output, "utf8").digest("hex").slice(0, 16)
          : undefined,
      },
      observation: inference.observation,
      capabilityVerified:
        inference.observation.status >= 200 &&
        inference.observation.status < 300 &&
        Boolean(output.trim()),
    };
  }

  if (id === "ocr_space") {
    const url = new URL(currentBase(id) + "/parse/image");
    const form = new URLSearchParams();
    form.set("url", "https://www.w3.org/Icons/w3c_home.svg");
    form.set("language", "eng");
    form.set("isOverlayRequired", "false");
    const result = await requestJson(id, url, {
      method: "POST",
      headers: { apikey: secret || "", "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: form.toString(),
    });
    return { normalized: shapeOf(result.data), observation: result.observation, capabilityVerified: capabilityPasses(id, result.data) };
  }

  const url = new URL(currentBase(id));

  switch (id) {
    case "openalex":
      url.pathname += "/works";
      url.searchParams.set("search", "machine learning");
      url.searchParams.set("per-page", "1");
      break;
    case "arxiv":
      url.pathname += "/query";
      url.searchParams.set("search_query", "all:machine learning");
      url.searchParams.set("max_results", "1");
      break;
    case "semantic_scholar":
      url.pathname += "/paper/search";
      url.searchParams.set("query", "machine learning");
      url.searchParams.set("limit", "1");
      url.searchParams.set("fields", "title,url,year");
      break;
    case "crossref":
      url.pathname += "/works";
      url.searchParams.set("query.bibliographic", "machine learning");
      url.searchParams.set("rows", "1");
      url.searchParams.set("select", "DOI,title,URL");
      if (process.env.CROSSREF_MAILTO?.trim()) url.searchParams.set("mailto", process.env.CROSSREF_MAILTO.trim());
      break;
    case "unpaywall":
      url.pathname += "/" + UNPAYWALL_DOI;
      url.searchParams.set("email", process.env.UNPAYWALL_EMAIL || "");
      break;
    case "pexels":
      url.pathname += "/search";
      url.searchParams.set("query", "mountain");
      url.searchParams.set("per_page", "1");
      break;
    case "pixabay":
      url.searchParams.set("key", secret || "");
      url.searchParams.set("q", "mountain");
      url.searchParams.set("image_type", "photo");
      url.searchParams.set("safesearch", "true");
      url.searchParams.set("per_page", "3");
      break;
    case "pexafy":
      url.pathname += "/search/photos";
      url.searchParams.set("q", "mountain landscape");
      url.searchParams.set("per_page", "1");
      url.searchParams.set("orientation", "portrait");
      break;
    case "arcmira":
      url.pathname += "/transcripts/" + VIDEO_ID;
      url.searchParams.set("language", "en");
      break;
    case "transcriptyt":
      url.pathname += "/api/v1/transcript";
      url.searchParams.set("url", TRANSCRIPT_VIDEO_URL);
      break;
    case "vidwords":
      url.pathname += "/api/transcripts";
      break;
    case "tubetotranscript":
      url.pathname += "/transcript";
      url.searchParams.set("url", TRANSCRIPT_VIDEO_URL);
      break;
    case "youtube_data_api":
      url.pathname += "/search";
      url.searchParams.set("part", "snippet");
      url.searchParams.set("q", "machine learning");
      url.searchParams.set("type", "video");
      url.searchParams.set("maxResults", "1");
      url.searchParams.set("key", secret || "");
      break;
    case "gemini":
      url.pathname += "/models";
      url.searchParams.set("pageSize", "5");
      url.searchParams.set("key", secret || "");
      break;
    case "groq":
      url.pathname += "/models";
      break;
    case "openrouter":
      url.pathname += "/models";
      break;
    case "huggingface":
      url.pathname += "/models";
      break;
    case "freesound":
      url.pathname += "/search/text/";
      url.searchParams.set("query", "dog");
      url.searchParams.set("token", secret || "");
      break;
    case "open_meteo":
      url.pathname += "/forecast";
      url.searchParams.set("latitude", "11.0168");
      url.searchParams.set("longitude", "76.9558");
      url.searchParams.set("current", "temperature_2m");
      url.searchParams.set("forecast_days", "1");
      break;
    case "nominatim":
      url.pathname += "/search";
      url.searchParams.set("q", "Coimbatore");
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("limit", "1");
      break;
    default:
      break;
  }

  if (id === "semantic_scholar") {
    const result = await requestJson(id, url, {
      method: "GET",
      headers: { "x-api-key": secret || "", Accept: "application/json" },
    });
    return { normalized: shapeOf(result.data), observation: result.observation, capabilityVerified: capabilityPasses(id, result.data) };
  }

  if (id === "vidwords") {
    const result = await requestJson(id, url, {
      method: "POST",
      headers: { ...requestHeadersFor(id, secret), "Content-Type": "application/json" },
      body: JSON.stringify({ ids: ["dQw4w9WgXcQ"], lang: "en" }),
    });
    return { normalized: shapeOf(result.data), observation: result.observation, capabilityVerified: capabilityPasses(id, result.data) };
  }

  const result = await requestJson(id, url, {
    method: "GET",
    headers: id === "semantic_scholar"
      ? { "x-api-key": secret || "", Accept: "application/json" }
      : requestHeadersFor(id, secret),
  });

  if (id === "pexels" || id === "pixabay" || id === "pexafy") {
    const assetUrl = visualAssetUrl(id, result.data);
    const shouldMaterialize = process.env.SHORTFORGE_EXTERNAL_API_MATERIALIZE === "1";
    const materialization = shouldMaterialize && assetUrl
      ? await materializeVisual(assetUrl)
      : { required: true, executed: false };
    return {
      normalized: {
        search: shapeOf(result.data),
        materialization,
      },
      observation: result.observation,
      capabilityVerified: result.observation.status >= 200 &&
        result.observation.status < 300 &&
        Boolean((result.data as any) && assetUrl) &&
        (shouldMaterialize ? Boolean((materialization as any).nonEmpty) : false),
    };
  }

  if (id === "gemini" || id === "pixabay" || id === "youtube_data_api") {
    return { normalized: shapeOf(result.data), observation: result.observation, capabilityVerified: capabilityPasses(id, result.data) };
  }

  return { normalized: shapeOf(result.data), observation: result.observation, capabilityVerified: capabilityPasses(id, result.data) };

  const result = await requestJson(id, url, {
    method: "GET",
    headers: requestHeadersFor(id, secret),
  });
  return { normalized: shapeOf(result.data), observation: result.observation, capabilityVerified: capabilityPasses(id, result.data) };
}
