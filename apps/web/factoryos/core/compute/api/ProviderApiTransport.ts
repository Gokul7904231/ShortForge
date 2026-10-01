/**
 * Provider-neutral HTTP transport.
 *
 * Rules:
 * - authentication is injected, never logged;
 * - GET/HEAD/DELETE may retry transient failures;
 * - non-idempotent mutations never auto-retry after an ambiguous network
 *   outcome; callers must reconcile first;
 * - Retry-After is honored for 429;
 * - provider error payloads are normalized.
 */

export type ProviderRetryMode = "NONE" | "SAFE" | "RECONCILE";

export interface ProviderTransportRequest {
  method: string;
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
  retryMode?: ProviderRetryMode;
  idempotencyKey?: string;
}

export interface ProviderTransportResponse<T> {
  status: number;
  headers: Headers;
  data: T;
  requestId?: string;
  attempt: number;
}

export class ProviderApiError extends Error {
  readonly status?: number;
  readonly providerCode?: string;
  readonly providerRequestId?: string;
  readonly retryAfterMs?: number;
  readonly retryable: boolean;
  readonly ambiguous: boolean;
  readonly payload?: unknown;

  constructor(
    message: string,
    details: {
      status?: number;
      providerCode?: string;
      providerRequestId?: string;
      retryAfterMs?: number;
      retryable?: boolean;
      ambiguous?: boolean;
      payload?: unknown;
    } = {},
  ) {
    super(message);
    this.name = "ProviderApiError";
    this.status = details.status;
    this.providerCode = details.providerCode;
    this.providerRequestId = details.providerRequestId;
    this.retryAfterMs = details.retryAfterMs;
    this.retryable = Boolean(details.retryable);
    this.ambiguous = Boolean(details.ambiguous);
    this.payload = details.payload;
  }
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return undefined;
}

function requestIdFromHeaders(headers: Headers): string | undefined {
  return (
    headers.get("x-request-id") ||
    headers.get("x-requestid") ||
    headers.get("runpod-request-id") ||
    headers.get("cf-ray") ||
    undefined
  );
}

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function providerMessage(payload: any, fallback: string): string {
  if (typeof payload === "string" && payload.trim()) return payload;
  if (payload && typeof payload === "object") {
    return (
      payload.message ||
      payload.error ||
      payload.detail ||
      payload.error_message ||
      fallback
    );
  }
  return fallback;
}

export class ProviderApiTransport {
  constructor(
    private readonly baseUrl: string,
    private readonly bearerToken?: string,
    private readonly defaultTimeoutMs = 15000,
    private readonly defaultHeaders: Record<string, string> = {},
  ) {}

  public async request<T = unknown>(
    req: ProviderTransportRequest,
  ): Promise<ProviderTransportResponse<T>> {
    const retryMode: ProviderRetryMode =
      req.retryMode ??
      (["GET", "HEAD", "DELETE"].includes(req.method.toUpperCase()) ? "SAFE" : "NONE");

    const maxAttempts = retryMode === "SAFE" ? 3 : 1;
    let lastError: ProviderApiError | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const response = await this.perform<T>(req);
        return { ...response, attempt };
      } catch (error) {
        const normalized =
          error instanceof ProviderApiError
            ? error
            : new ProviderApiError(String(error), {
                retryable: true,
                ambiguous: !["GET", "HEAD"].includes(req.method.toUpperCase()),
              });

        lastError = normalized;
        if (!normalized.retryable || attempt >= maxAttempts) throw normalized;

        const backoffMs =
          normalized.retryAfterMs ??
          Math.min(5000, 250 * 2 ** (attempt - 1)) +
            Math.floor(Math.random() * 100);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      }
    }

    throw lastError ?? new ProviderApiError("Provider request failed.");
  }

  private async perform<T>(
    req: ProviderTransportRequest,
  ): Promise<ProviderTransportResponse<T>> {
    const url = this.resolve(req.path);
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      req.timeoutMs ?? this.defaultTimeoutMs,
    );

    const headers: Record<string, string> = {
      Accept: "application/json",
      ...(req.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(this.bearerToken ? { Authorization: `Bearer ${this.bearerToken}` } : {}),
      ...this.defaultHeaders,
      ...(req.idempotencyKey ? { "Idempotency-Key": req.idempotencyKey } : {}),
      ...(req.headers || {}),
    };

    try {
      const response = await fetch(url, {
        method: req.method,
        headers,
        body: req.body === undefined ? undefined : JSON.stringify(req.body),
        signal: controller.signal,
      });

      const payload = await parseBody(response);
      const requestId = requestIdFromHeaders(response.headers);

      if (!response.ok) {
        const retryable =
          response.status === 408 ||
          response.status === 425 ||
          response.status === 429 ||
          response.status >= 500;

        throw new ProviderApiError(
          providerMessage(payload, `Provider HTTP ${response.status}`),
          {
            status: response.status,
            providerCode:
              payload && typeof payload === "object"
                ? String(
                    (payload as Record<string, unknown>).code ||
                      (payload as Record<string, unknown>).error_code ||
                      "",
                  )
                : undefined,
            providerRequestId: requestId,
            retryAfterMs: parseRetryAfter(response.headers.get("retry-after")),
            retryable,
            ambiguous:
              !["GET", "HEAD"].includes(req.method.toUpperCase()) &&
              retryable,
            payload,
          },
        );
      }

      return {
        status: response.status,
        headers: response.headers,
        data: payload as T,
        requestId,
        attempt: 1,
      };
    } catch (error) {
      if (error instanceof ProviderApiError) throw error;
      const timedOut = (error as any)?.name === "AbortError";
      throw new ProviderApiError(
        timedOut
          ? `Provider request timed out after ${req.timeoutMs ?? this.defaultTimeoutMs}ms`
          : `Provider network failure: ${String((error as any)?.message || error)}`,
        {
          retryable: true,
          ambiguous: !["GET", "HEAD"].includes(req.method.toUpperCase()),
        },
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private resolve(path: string): string {
    if (/^https?:\/\//i.test(path)) return path;
    return `${this.baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
  }
}
