import { randomUUID } from "node:crypto";
import {
  SafetyDocumentProviderError,
  type OcrDocumentRequest,
  type OcrDocumentResult,
  type ThreatCheckRequest,
  type ThreatCheckResult,
  type ThreatMatch,
  type UrlscanResult,
  type UrlscanSubmitResult,
  type UrlscanVisibility,
} from "./SafetyDocumentContracts";

function boundedUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new SafetyDocumentProviderError("shared", "Invalid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SafetyDocumentProviderError(
      "shared",
      "Only http/https URLs are accepted.",
    );
  }
  if (url.username || url.password) {
    throw new SafetyDocumentProviderError(
      "shared",
      "URLs containing embedded credentials are rejected.",
    );
  }
  return url;
}

async function readJson(
  response: Response,
  providerId: string,
): Promise<any> {
  const text = await response.text();
  if (!response.ok) {
    let detail = "";
    try {
      const parsed = JSON.parse(text);
      detail = String(parsed?.error?.message ?? parsed?.ErrorMessage ?? "");
    } catch {}
    throw new SafetyDocumentProviderError(
      providerId,
      providerId +
        " returned HTTP " +
        response.status +
        (detail ? ": " + detail.slice(0, 300) : ""),
      {
        status: response.status,
        retryable: response.status === 429 || response.status >= 500,
      },
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new SafetyDocumentProviderError(
      providerId,
      "Provider returned malformed JSON.",
    );
  }
}

export class OcrSpaceProvider {
  readonly id = "OCR_SPACE" as const;

  async parse(request: OcrDocumentRequest): Promise<OcrDocumentResult> {
    const apiKey = process.env.OCR_SPACE_API_KEY?.trim();
    if (!apiKey) {
      throw new SafetyDocumentProviderError(
        this.id,
        "OCR_SPACE_API_KEY is not configured.",
      );
    }

    const inputCount = Number(Boolean(request.url)) + Number(Boolean(request.base64Image));
    if (inputCount !== 1) {
      throw new SafetyDocumentProviderError(
        this.id,
        "Exactly one of url or base64Image is required.",
      );
    }
    if (request.url) boundedUrl(request.url);
    if (request.base64Image && !request.base64Image.startsWith("data:")) {
      throw new SafetyDocumentProviderError(
        this.id,
        "base64Image must be a data URL.",
      );
    }

    const form = new URLSearchParams();
    if (request.url) form.set("url", request.url);
    if (request.base64Image) form.set("base64Image", request.base64Image);
    form.set("language", request.language ?? "eng");
    form.set("isOverlayRequired", request.overlayRequired ? "true" : "false");

    const response = await fetch("https://api.ocr.space/parse/image", {
      method: "POST",
      headers: {
        apikey: apiKey,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: form.toString(),
      signal: AbortSignal.timeout(30_000),
    });

    const payload = await readJson(response, this.id);
    if (!Array.isArray(payload?.ParsedResults)) {
      throw new SafetyDocumentProviderError(
        this.id,
        "OCR.Space response did not contain ParsedResults.",
      );
    }

    const pages = payload.ParsedResults.map(
      (page: any, index: number) => ({
        pageNumber: index + 1,
        text: typeof page?.ParsedText === "string" ? page.ParsedText : "",
      }),
    );

    const exitCode = Number(payload?.OCRExitCode ?? 0);
    const isErrored = Boolean(payload?.IsErroredOnProcessing);
    const errorMessage = Array.isArray(payload?.ErrorMessage)
      ? payload.ErrorMessage.join("; ")
      : typeof payload?.ErrorMessage === "string"
        ? payload.ErrorMessage
        : undefined;

    return {
      providerId: this.id,
      exitCode,
      parsedText: pages.map((page: { text: string }) => page.text).join("\n"),
      pages,
      isErrored,
      errorMessage,
      requestId: "ocr_" + randomUUID().slice(0, 10),
      retrievedAt: new Date().toISOString(),
    };
  }
}

export class GoogleSafeBrowsingProvider {
  readonly id = "GOOGLE_SAFE_BROWSING" as const;

  async check(request: ThreatCheckRequest): Promise<ThreatCheckResult> {
    if (process.env.SAFE_BROWSING_NONCOMMERCIAL_CONFIRMED !== "true") {
      throw new SafetyDocumentProviderError(
        this.id,
        "Safe Browsing API is gated: SAFE_BROWSING_NONCOMMERCIAL_CONFIRMED must be true.",
      );
    }
    const apiKey = process.env.SAFE_BROWSING_API_KEY?.trim();
    if (!apiKey) {
      throw new SafetyDocumentProviderError(
        this.id,
        "SAFE_BROWSING_API_KEY is not configured.",
      );
    }

    const target = boundedUrl(request.url);
    const endpoint = new URL(
      "https://safebrowsing.googleapis.com/v4/threatMatches:find",
    );
    endpoint.searchParams.set("key", apiKey);

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client: {
          clientId: "shortforge",
          clientVersion:
            request.clientVersion ??
            process.env.ENGINE_VERSION ??
            "1.0",
        },
        threatInfo: {
          threatTypes: [
            "MALWARE",
            "SOCIAL_ENGINEERING",
            "UNWANTED_SOFTWARE",
            "POTENTIALLY_HARMFUL_APPLICATION",
          ],
          platformTypes: ["ANY_PLATFORM"],
          threatEntryTypes: ["URL"],
          threatEntries: [{ url: target.toString() }],
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });

    const payload = await readJson(response, this.id);
    const matches: ThreatMatch[] = Array.isArray(payload?.matches)
      ? payload.matches
          .map((match: any) => ({
            threatType: String(match?.threatType ?? ""),
            platformType: String(match?.platformType ?? ""),
            threatEntryType: String(match?.threatEntryType ?? ""),
            url: String(match?.threat?.url ?? target.toString()),
          }))
          .filter((match: ThreatMatch) => match.threatType && match.url)
      : [];

    return {
      providerId: this.id,
      matched: matches.length > 0,
      matches,
      requestId: "safebrowsing_" + randomUUID().slice(0, 10),
      retrievedAt: new Date().toISOString(),
      usageBoundary: "NON_COMMERCIAL_ONLY",
    };
  }
}

export class UrlscanProvider {
  readonly id = "URLSCAN" as const;

  async submit(
    url: string,
    visibility: UrlscanVisibility = "private",
  ): Promise<UrlscanSubmitResult> {
    const apiKey = process.env.URLSCAN_API_KEY?.trim();
    if (!apiKey) {
      throw new SafetyDocumentProviderError(
        this.id,
        "URLSCAN_API_KEY is not configured.",
      );
    }

    const target = boundedUrl(url);
    const response = await fetch("https://urlscan.io/api/v1/scan", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": apiKey,
        Accept: "application/json",
      },
      body: JSON.stringify({
        url: target.toString(),
        visibility,
      }),
      signal: AbortSignal.timeout(15_000),
    });

    const payload = await readJson(response, this.id);
    const scanId = typeof payload?.uuid === "string" ? payload.uuid : "";
    if (!scanId) {
      throw new SafetyDocumentProviderError(
        this.id,
        "urlscan response did not include a scan UUID.",
      );
    }

    const resultUrl =
      typeof payload?.result === "string"
        ? payload.result
        : "https://urlscan.io/api/v1/result/" + encodeURIComponent(scanId) + "/";

    return {
      providerId: this.id,
      scanId,
      requestedUrl: target.toString(),
      visibility:
        payload?.visibility === "public" ||
        payload?.visibility === "unlisted" ||
        payload?.visibility === "private"
          ? payload.visibility
          : visibility,
      resultUrl,
      submittedAt: new Date().toISOString(),
    };
  }

  async getResult(
    scanId: string,
  ): Promise<UrlscanResult> {
    const apiKey = process.env.URLSCAN_API_KEY?.trim();
    if (!apiKey) {
      throw new SafetyDocumentProviderError(
        this.id,
        "URLSCAN_API_KEY is not configured.",
      );
    }
    if (!/^[0-9a-f-]{20,}$/i.test(scanId)) {
      throw new SafetyDocumentProviderError(
        this.id,
        "Invalid urlscan scan id.",
      );
    }

    const response = await fetch(
      "https://urlscan.io/api/v1/result/" +
        encodeURIComponent(scanId) +
        "/",
      {
        headers: {
          "api-key": apiKey,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(15_000),
      },
    );

    if (response.status === 404) {
      return {
        providerId: this.id,
        scanId,
        url: "",
        visibility: "private",
        status: "PENDING",
        retrievedAt: new Date().toISOString(),
      };
    }

    const payload = await readJson(response, this.id);
    return {
      providerId: this.id,
      scanId,
      url: typeof payload?.page?.url === "string" ? payload.page.url : "",
      visibility:
        payload?.visibility === "public" ||
        payload?.visibility === "unlisted" ||
        payload?.visibility === "private"
          ? payload.visibility
          : "private",
      status: "READY",
      page: {
        url:
          typeof payload?.page?.url === "string"
            ? payload.page.url
            : undefined,
        domain:
          typeof payload?.page?.domain === "string"
            ? payload.page.domain
            : undefined,
        title:
          typeof payload?.page?.title === "string"
            ? payload.page.title
            : undefined,
        status:
          typeof payload?.page?.status === "string"
            ? payload.page.status
            : undefined,
      },
      lists:
        payload?.lists && typeof payload.lists === "object"
          ? payload.lists
          : undefined,
      scanner:
        payload?.scanner && typeof payload.scanner === "object"
          ? payload.scanner
          : undefined,
      retrievedAt: new Date().toISOString(),
    };
  }

  async waitForResult(
    scanId: string,
    options: { maxWaitMs?: number; pollMs?: number } = {},
  ): Promise<UrlscanResult> {
    const deadline =
      Date.now() + (options.maxWaitMs ?? 120_000);
    const pollMs = Math.max(1000, options.pollMs ?? 5000);

    while (Date.now() < deadline) {
      const result = await this.getResult(scanId);
      if (result.status === "READY") return result;
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }

    throw new SafetyDocumentProviderError(
      this.id,
      "urlscan result did not become ready before timeout.",
      { retryable: true },
    );
  }
}
