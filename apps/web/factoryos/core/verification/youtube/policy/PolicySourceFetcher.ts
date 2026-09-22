/**
 * FactoryOS YouTube Monetization Guardian — Policy Source Fetcher
 * Secure, allowlisted HTTP/HTTPS client for retrieving official policy documentation.
 * Enforces HTTPS only, host allowlist, redirect safety, size limits, and cryptographic content hashing.
 */

import * as crypto from "node:crypto";
import { EvidenceRef, EvidenceRefFactory } from "../evidence/EvidenceRef";

export interface FetchPolicySourceResult {
  readonly success: boolean;
  readonly url: string;
  readonly statusCode?: number;
  readonly contentChecksumSha256?: string;
  readonly byteLength?: number;
  readonly retrievedAt: string;
  readonly normalizedText?: string;
  readonly evidenceRef?: EvidenceRef;
  readonly errorCode?:
    | "DISALLOWED_HOST"
    | "DISALLOWED_PROTOCOL"
    | "REDIRECT_VIOLATION"
    | "SIZE_EXCEEDED"
    | "TIMEOUT"
    | "HTTP_ERROR"
    | "FETCH_FAILED";
  readonly errorMessage?: string;
}

export class PolicySourceFetcher {
  private static readonly ALLOWED_HOSTS = new Set(["support.google.com", "www.youtube.com"]);
  private static readonly MAX_BYTES = 5 * 1024 * 1024; // 5MB
  private static readonly TIMEOUT_MS = 5000;

  /**
   * Fetches official documentation from allowed domains with strict safety guards.
   */
  public static async fetchSource(urlStr: string): Promise<FetchPolicySourceResult> {
    const retrievedAt = new Date().toISOString();

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(urlStr);
    } catch {
      return {
        success: false,
        url: urlStr,
        retrievedAt,
        errorCode: "DISALLOWED_HOST",
        errorMessage: "Malformed URL",
      };
    }

    if (parsedUrl.protocol !== "https:") {
      return {
        success: false,
        url: urlStr,
        retrievedAt,
        errorCode: "DISALLOWED_PROTOCOL",
        errorMessage: `Protocol '${parsedUrl.protocol}' not allowed. HTTPS required.`,
      };
    }

    if (!this.ALLOWED_HOSTS.has(parsedUrl.hostname)) {
      return {
        success: false,
        url: urlStr,
        retrievedAt,
        errorCode: "DISALLOWED_HOST",
        errorMessage: `Host '${parsedUrl.hostname}' is not in policy allowlist (${Array.from(this.ALLOWED_HOSTS).join(", ")})`,
      };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.TIMEOUT_MS);

    try {
      const response = await fetch(urlStr, {
        signal: controller.signal,
        redirect: "follow",
        headers: {
          "User-Agent": "ShortForge-PolicyGuard/2.0 (+https://support.google.com)",
          Accept: "text/html,application/xhtml+xml,text/plain",
        },
      });

      clearTimeout(timeoutId);

      // Verify redirect target stayed on allowed host
      const finalUrl = new URL(response.url);
      if (!this.ALLOWED_HOSTS.has(finalUrl.hostname)) {
        return {
          success: false,
          url: urlStr,
          retrievedAt,
          errorCode: "REDIRECT_VIOLATION",
          errorMessage: `Redirected to untrusted host '${finalUrl.hostname}'`,
        };
      }

      if (!response.ok) {
        return {
          success: false,
          url: urlStr,
          statusCode: response.status,
          retrievedAt,
          errorCode: "HTTP_ERROR",
          errorMessage: `HTTP ${response.status} ${response.statusText}`,
        };
      }

      const buffer = await response.arrayBuffer();
      if (buffer.byteLength > this.MAX_BYTES) {
        return {
          success: false,
          url: urlStr,
          retrievedAt,
          errorCode: "SIZE_EXCEEDED",
          errorMessage: `Response size ${buffer.byteLength} exceeds maximum limit of ${this.MAX_BYTES} bytes`,
        };
      }

      const content = Buffer.from(buffer);
      const contentChecksumSha256 = crypto.createHash("sha256").update(content).digest("hex");
      const normalizedText = content.toString("utf8").replace(/\s+/g, " ").trim();

      const evidenceRef = EvidenceRefFactory.policySource(urlStr, contentChecksumSha256, {
        byteLength: content.byteLength,
        retrievedAt,
        statusCode: response.status,
      });

      return {
        success: true,
        url: urlStr,
        statusCode: response.status,
        contentChecksumSha256,
        byteLength: content.byteLength,
        retrievedAt,
        normalizedText,
        evidenceRef,
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      const isTimeout = err.name === "AbortError";
      return {
        success: false,
        url: urlStr,
        retrievedAt,
        errorCode: isTimeout ? "TIMEOUT" : "FETCH_FAILED",
        errorMessage: err.message || "Fetch failed",
      };
    }
  }
}
