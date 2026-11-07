/**
 * FactoryOS Structured AI Provider Errors
 * =======================================
 * Categorized error taxonomy distinguishing retryable transient faults from
 * non-retryable configuration / authentication / bad-request errors.
 */

export abstract class ProviderBaseError extends Error {
  public abstract readonly code: string;
  public abstract readonly retryable: boolean;
  public readonly provider: string;
  public readonly statusCode?: number;

  constructor(message: string, provider: string, statusCode?: number) {
    super(message);
    this.name = this.constructor.name;
    this.provider = provider;
    this.statusCode = statusCode;
  }
}

export class ProviderTimeoutError extends ProviderBaseError {
  public readonly code = "PROVIDER_TIMEOUT";
  public readonly retryable = true;
}

export class ProviderRateLimitError extends ProviderBaseError {
  public readonly code = "PROVIDER_RATE_LIMIT";
  public readonly retryable = true;
}

export class ProviderServerError extends ProviderBaseError {
  public readonly code = "PROVIDER_SERVER_ERROR";
  public readonly retryable = true;
}

export class ProviderUnavailableError extends ProviderBaseError {
  public readonly code = "PROVIDER_UNAVAILABLE";
  public readonly retryable = true;
}

export class ProviderAuthenticationError extends ProviderBaseError {
  public readonly code = "PROVIDER_AUTHENTICATION_ERROR";
  public readonly retryable = false;
}

export class ProviderBadRequestError extends ProviderBaseError {
  public readonly code = "PROVIDER_BAD_REQUEST";
  public readonly retryable = false;
}

export class ProviderUnknownError extends ProviderBaseError {
  public readonly code = "PROVIDER_UNKNOWN_ERROR";
  public readonly retryable = true;
}

/**
 * Classifies an unknown fetch/API error into a structured ProviderBaseError.
 */
export function classifyProviderError(err: any, provider: string): ProviderBaseError {
  if (err instanceof ProviderBaseError) {
    return err;
  }

  const msg = (err?.message || String(err)).toLowerCase();
  const status = typeof err?.status === "number" ? err.status : (typeof err?.statusCode === "number" ? err.statusCode : undefined);

  if (err?.name === "AbortError" || msg.includes("timeout") || msg.includes("timed out") || msg.includes("etimedout")) {
    return new ProviderTimeoutError(`Request to ${provider} timed out: ${err.message}`, provider, status);
  }

  if (status === 429 || msg.includes("429") || msg.includes("rate limit") || msg.includes("quota exceeded") || msg.includes("too many requests")) {
    return new ProviderRateLimitError(`Rate limit exceeded for ${provider}: ${err.message}`, provider, status || 429);
  }

  if (status === 401 || status === 402 || status === 403 || msg.includes("401") || msg.includes("402") || msg.includes("insufficient credits") || msg.includes("payment required") || msg.includes("403") || msg.includes("unauthorized") || msg.includes("invalid api key") || msg.includes("permission denied")) {
    return new ProviderAuthenticationError(`Authentication failed for ${provider} (verify server .env configuration): ${err.message}`, provider, status);
  }

  if (status === 400 || status === 422 || msg.includes("400") || msg.includes("bad request") || msg.includes("malformed")) {
    return new ProviderBadRequestError(`Bad request sent to ${provider}: ${err.message}`, provider, status);
  }

  if ((status && status >= 500) || msg.includes("500") || msg.includes("502") || msg.includes("503") || msg.includes("504") || msg.includes("internal server error") || msg.includes("bad gateway")) {
    return new ProviderServerError(`Server error from ${provider} (status: ${status}): ${err.message}`, provider, status);
  }

  if (msg.includes("fetch failed") || msg.includes("econnrefused") || msg.includes("enotfound") || msg.includes("network error") || msg.includes("connection closed")) {
    return new ProviderUnavailableError(`Network unavailable when reaching ${provider}: ${err.message}`, provider, status);
  }

  return new ProviderUnknownError(`Unexpected error from ${provider}: ${err.message}`, provider, status);
}
