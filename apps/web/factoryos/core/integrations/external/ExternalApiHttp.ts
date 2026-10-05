import { randomUUID } from "node:crypto";
import {
  ExternalApiError,
  type ExternalApiCallResult,
  type ExternalApiRequestContext,
} from "./ExternalApiContracts";

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_BYTES = 4 * 1024 * 1024;

function retryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

async function readTextBounded(
  response: Response,
  maxBytes: number,
): Promise<string> {
  if (!response.body) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) {
      throw new Error("External API response exceeded configured size limit.");
    }
    return text;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("External API response exceeded configured size limit.");
    }

    chunks.push(value);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return new TextDecoder().decode(merged);
}

export function createRequestContext(
  purpose: string,
  input: Omit<ExternalApiRequestContext, "requestId" | "purpose"> = {},
): ExternalApiRequestContext {
  return {
    requestId: "ext_" + randomUUID().slice(0, 12),
    ...input,
    purpose,
  };
}

export async function fetchJson<T>(
  providerId: string,
  url: string,
  options: {
    method?: "GET" | "POST" | "PUT";
    headers?: Record<string, string>;
    body?: unknown;
    timeoutMs?: number;
    maxBytes?: number;
    signal?: AbortSignal;
  } = {},
): Promise<ExternalApiCallResult<T>> {
  const started = Date.now();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const controller = new AbortController();

  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  options.signal?.addEventListener("abort", onAbort, { once: true });

  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...(options.body !== undefined
        ? { "Content-Type": "application/json" }
        : {}),
      ...(options.headers ?? {}),
    };

    const response = await fetch(url, {
      method: options.method ?? "GET",
      headers,
      body:
        options.body === undefined
          ? undefined
          : JSON.stringify(options.body),
      signal: controller.signal,
    });

    const text = await readTextBounded(response, maxBytes);

    if (!response.ok) {
      let detail = text;
      try {
        const parsed = JSON.parse(text);
        detail =
          parsed?.error?.message ??
          parsed?.message ??
          detail;
      } catch {
        // Preserve bounded plain-text provider error.
      }

      throw new ExternalApiError(
        providerId,
        providerId +
          " returned HTTP " +
          response.status +
          (detail ? ": " + detail.slice(0, 500) : ""),
        {
          status: response.status,
          retryable: retryableStatus(response.status),
        },
      );
    }

    let data: T;
    try {
      data = JSON.parse(text) as T;
    } catch {
      throw new ExternalApiError(
        providerId,
        providerId + " returned a non-JSON response.",
      );
    }

    return {
      providerId,
      requestId: "ext_" + randomUUID().slice(0, 12),
      status: response.status,
      durationMs: Date.now() - started,
      data,
    };
  } catch (error) {
    if (error instanceof ExternalApiError) throw error;

    const message =
      error instanceof Error ? error.message : String(error);

    throw new ExternalApiError(providerId, message, {
      retryable: true,
    });
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", onAbort);
  }
}

export async function fetchText(
  providerId: string,
  url: string,
  options: {
    headers?: Record<string, string>;
    timeoutMs?: number;
    maxBytes?: number;
    signal?: AbortSignal;
  } = {},
): Promise<ExternalApiCallResult<string>> {
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );

  const onAbort = () => controller.abort();
  options.signal?.addEventListener("abort", onAbort, { once: true });

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "text/plain, application/xml, application/atom+xml",
        ...(options.headers ?? {}),
      },
      signal: controller.signal,
    });

    const text = await readTextBounded(
      response,
      options.maxBytes ?? DEFAULT_MAX_BYTES,
    );

    if (!response.ok) {
      throw new ExternalApiError(
        providerId,
        providerId + " returned HTTP " + response.status + ".",
        {
          status: response.status,
          retryable: retryableStatus(response.status),
        },
      );
    }

    return {
      providerId,
      requestId: "ext_" + randomUUID().slice(0, 12),
      status: response.status,
      durationMs: Date.now() - started,
      data: text,
    };
  } catch (error) {
    if (error instanceof ExternalApiError) throw error;
    throw new ExternalApiError(
      providerId,
      error instanceof Error ? error.message : String(error),
      { retryable: true },
    );
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", onAbort);
  }
}

export function bearerHeaders(token: string): Record<string, string> {
  return {
    Authorization: "Bearer " + token,
  };
}
