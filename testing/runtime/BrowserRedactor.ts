/**
 * FactoryOS Browser Evidence Redactor
 * Strictly enforces that sensitive credentials, cookies, tokens, and authorization
 * secrets are never written to disk or preserved in evidence logs.
 */

const SENSITIVE_HEADER_KEYS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "apikey",
  "token",
  "x-auth-token",
  "proxy-authorization",
  "session",
  "x-session-id",
]);

const SENSITIVE_PARAM_NAMES = new Set([
  "key",
  "api_key",
  "apikey",
  "token",
  "access_token",
  "refresh_token",
  "auth",
  "password",
  "secret",
  "credential",
]);

export class BrowserRedactor {
  public static redactHeaders(headers: Record<string, string> | undefined | null): Record<string, string> {
    if (!headers) return {};
    const sanitized: Record<string, string> = {};

    for (const [key, value] of Object.entries(headers)) {
      const lower = key.toLowerCase();
      if (SENSITIVE_HEADER_KEYS.has(lower) || lower.includes("secret") || lower.includes("auth") || lower.includes("token")) {
        sanitized[key] = "[REDACTED]";
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  public static redactUrl(rawUrl: string): string {
    try {
      const parsed = new URL(rawUrl);
      for (const param of Array.from(parsed.searchParams.keys())) {
        const lower = param.toLowerCase();
        if (
          SENSITIVE_PARAM_NAMES.has(lower) ||
          lower.includes("key") ||
          lower.includes("token") ||
          lower.includes("secret") ||
          lower.includes("pass")
        ) {
          parsed.searchParams.set(param, "[REDACTED]");
        }
      }
      return parsed.toString();
    } catch {
      return rawUrl;
    }
  }

  public static redactText(text: string): string {
    if (!text) return "";
    return text
      .replace(/Bearer\s+[A-Za-z0-9\-_.]+/gi, "Bearer [REDACTED]")
      .replace(/key=[A-Za-z0-9\-_.]+/gi, "key=[REDACTED]")
      .replace(/token=[A-Za-z0-9\-_.]+/gi, "token=[REDACTED]")
      .replace(/password=[^\s&]+/gi, "password=[REDACTED]");
  }
}
