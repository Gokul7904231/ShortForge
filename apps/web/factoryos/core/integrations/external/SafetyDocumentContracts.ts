export interface OcrDocumentRequest {
  readonly url?: string;
  readonly base64Image?: string;
  readonly language?: string;
  readonly overlayRequired?: boolean;
}

export interface OcrDocumentResult {
  readonly providerId: "OCR_SPACE";
  readonly exitCode: number;
  readonly parsedText: string;
  readonly pages: readonly {
    readonly pageNumber: number;
    readonly text: string;
  }[];
  readonly isErrored: boolean;
  readonly errorMessage?: string;
  readonly requestId: string;
  readonly retrievedAt: string;
}

export interface ThreatCheckRequest {
  readonly url: string;
  readonly clientVersion?: string;
}

export interface ThreatMatch {
  readonly threatType: string;
  readonly platformType: string;
  readonly threatEntryType: string;
  readonly url: string;
}

export interface ThreatCheckResult {
  readonly providerId: "GOOGLE_SAFE_BROWSING";
  readonly matched: boolean;
  readonly matches: readonly ThreatMatch[];
  readonly requestId: string;
  readonly retrievedAt: string;
  readonly usageBoundary: "NON_COMMERCIAL_ONLY";
}

export type UrlscanVisibility = "public" | "unlisted" | "private";

export interface UrlscanSubmitResult {
  readonly providerId: "URLSCAN";
  readonly scanId: string;
  readonly requestedUrl: string;
  readonly visibility: UrlscanVisibility;
  readonly resultUrl: string;
  readonly submittedAt: string;
  readonly requestId?: string;
}

export interface UrlscanResult {
  readonly providerId: "URLSCAN";
  readonly scanId: string;
  readonly url: string;
  readonly visibility: UrlscanVisibility;
  readonly status: "PENDING" | "READY";
  readonly page?: {
    readonly url?: string;
    readonly domain?: string;
    readonly title?: string;
    readonly status?: string;
  };
  readonly lists?: Readonly<Record<string, unknown>>;
  readonly scanner?: Readonly<Record<string, unknown>>;
  readonly retrievedAt: string;
}

export class SafetyDocumentProviderError extends Error {
  readonly providerId: string;
  readonly status?: number;
  readonly retryable: boolean;

  constructor(
    providerId: string,
    message: string,
    options: { status?: number; retryable?: boolean } = {},
  ) {
    super(message);
    this.name = "SafetyDocumentProviderError";
    this.providerId = providerId;
    this.status = options.status;
    this.retryable = options.retryable ?? false;
  }
}
