import crypto from "node:crypto";

const AUTHORIZATION_ENDPOINT = "https://www.kaggle.com/api/v1/oauth2/authorize";
const TOKEN_ENDPOINT = "https://www.kaggle.com/api/v1/oauth2/token";
const INTROSPECT_ENDPOINT = "https://www.kaggle.com/api/v1/oauth2/introspect";

export const KAGGLE_OAUTH_SCOPES = [
  "kernels.get:*",
  "kernels.update:*",
  "kernels.execute:*",
  "kernels.delete:*",
];

type KaggleOAuthClientType = "PUBLIC" | "ORGANIZATION";

type KaggleTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  username?: string;
  user_id?: number;
  scope?: string;
  token_type?: string;
};

export interface KaggleTokenIdentity {
  username: string;
  userId: number;
  scope: string;
  expiresAt?: number;
}

function clientType(): KaggleOAuthClientType {
  return (process.env.KAGGLE_OAUTH_CLIENT_TYPE || "ORGANIZATION").toUpperCase() as KaggleOAuthClientType;
}

function stateSecret(): string {
  const secret = process.env.OAUTH_STATE_SECRET || process.env.INTERNAL_API_SECRET_KEY || "";
  if (!secret) throw new Error("COMPUTE_OAUTH_STATE_SECRET_MISSING");
  return secret;
}

export function isKaggleOAuthConfigured(): boolean {
  const clientId = process.env.KAGGLE_OAUTH_CLIENT_ID;
  if (!clientId) return false;
  if (clientType() === "ORGANIZATION") {
    return !!process.env.KAGGLE_OAUTH_ORG_USERNAME && !!process.env.KAGGLE_OAUTH_ORG_API_KEY;
  }
  return true;
}

export function kaggleOAuthClientType(): KaggleOAuthClientType {
  return clientType();
}

export function createKaggleOAuthState(userId: string, codeVerifier?: string): {
  state: string;
  cookieValue: string;
} {
  const nonce = crypto.randomBytes(32).toString("base64url");
  const issuedAt = Date.now();
  const payload = `${userId}:${nonce}:${issuedAt}`;
  const hmac = crypto.createHmac("sha256", stateSecret()).update(payload).digest("base64url");
  const state = Buffer.from(JSON.stringify({ userId, nonce, issuedAt, hmac }), "utf8").toString("base64url");
  return {
    state,
    cookieValue: Buffer.from(
      JSON.stringify({ nonce, issuedAt, codeVerifier: codeVerifier || "" }),
      "utf8",
    ).toString("base64url"),
  };
}

export function verifyKaggleOAuthState(
  state: string,
  cookieValue: string | undefined,
  expectedUserId: string,
): string | undefined {
  if (!cookieValue) throw new Error("COMPUTE_KAGGLE_OAUTH_COOKIE_MISSING");
  let parsed: { userId?: string; nonce?: string; issuedAt?: number; hmac?: string };
  let cookie: { nonce?: string; issuedAt?: number; codeVerifier?: string };
  try {
    parsed = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
    cookie = JSON.parse(Buffer.from(cookieValue, "base64url").toString("utf8"));
  } catch {
    throw new Error("COMPUTE_KAGGLE_OAUTH_STATE_INVALID");
  }
  if (!parsed.userId || !parsed.nonce || !parsed.issuedAt || !parsed.hmac || parsed.userId !== expectedUserId) {
    throw new Error("COMPUTE_KAGGLE_OAUTH_STATE_INVALID");
  }
  if (cookie.nonce !== parsed.nonce) throw new Error("COMPUTE_KAGGLE_OAUTH_STATE_NONCE_MISMATCH");
  if (Date.now() - parsed.issuedAt > 10 * 60 * 1000) throw new Error("COMPUTE_KAGGLE_OAUTH_STATE_EXPIRED");
  const payload = `${parsed.userId}:${parsed.nonce}:${parsed.issuedAt}`;
  const expected = crypto.createHmac("sha256", stateSecret()).update(payload).digest("base64url");
  if (
    parsed.hmac.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(parsed.hmac), Buffer.from(expected))
  ) {
    throw new Error("COMPUTE_KAGGLE_OAUTH_STATE_HMAC_INVALID");
  }
  return cookie.codeVerifier || undefined;
}

export function buildKaggleAuthorizationUrl(
  redirectUri: string,
  state: string,
  codeChallenge?: string,
): string {
  if (!isKaggleOAuthConfigured()) throw new Error("COMPUTE_KAGGLE_OAUTH_UNAVAILABLE");
  const params = new URLSearchParams({
    client_id: process.env.KAGGLE_OAUTH_CLIENT_ID!,
    redirect_uri: redirectUri,
    scope: KAGGLE_OAUTH_SCOPES.join(" "),
    state,
    response_type: "code",
    response_mode: "query",
  });
  if (clientType() === "PUBLIC") {
    if (!codeChallenge) throw new Error("COMPUTE_KAGGLE_OAUTH_PKCE_REQUIRED");
    params.set("code_challenge", codeChallenge);
    params.set("code_challenge_method", "S256");
  }
  return `${AUTHORIZATION_ENDPOINT}?${params.toString()}`;
}

async function kaggleRequest(
  body: URLSearchParams,
  init: RequestInit = {},
): Promise<KaggleTokenResponse> {
  const response = await fetch(TOKEN_ENDPOINT, {
    ...init,
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      ...(init.headers || {}),
    },
    body,
  });
  const data = (await response.json().catch(() => ({}))) as KaggleTokenResponse & {
    error?: string;
    error_description?: string;
  };
  if (!response.ok) {
    throw new Error(
      `COMPUTE_KAGGLE_OAUTH_TOKEN_EXCHANGE_FAILED:${data.error || response.status}:${data.error_description || "request failed"}`,
    );
  }
  return data;
}

export async function exchangeKaggleCode(
  code: string,
  redirectUri: string,
  codeVerifier?: string,
): Promise<KaggleTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: process.env.KAGGLE_OAUTH_CLIENT_ID || "",
    redirect_uri: redirectUri,
  });
  const headers: Record<string, string> = {};
  if (clientType() === "PUBLIC") {
    if (!codeVerifier) throw new Error("COMPUTE_KAGGLE_OAUTH_PKCE_VERIFIER_MISSING");
    body.set("code_verifier", codeVerifier);
  } else {
    const username = process.env.KAGGLE_OAUTH_ORG_USERNAME;
    const apiKey = process.env.KAGGLE_OAUTH_ORG_API_KEY;
    if (!username || !apiKey) throw new Error("COMPUTE_KAGGLE_OAUTH_ORG_CREDENTIALS_MISSING");
    headers.Authorization = `Basic ${Buffer.from(`${username}:${apiKey}`).toString("base64")}`;
  }
  return kaggleRequest(body, { headers });
}

export async function refreshKaggleAccessToken(
  refreshToken: string,
): Promise<KaggleTokenResponse> {
  if (!refreshToken) throw new Error("COMPUTE_KAGGLE_REFRESH_TOKEN_MISSING");
  return kaggleRequest(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  );
}

export async function introspectKaggleToken(
  accessToken: string,
): Promise<KaggleTokenIdentity> {
  if (!accessToken) throw new Error("COMPUTE_KAGGLE_TOKEN_MISSING");
  const response = await fetch(INTROSPECT_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Bearer ${accessToken}`,
    },
    body: new URLSearchParams({ token: accessToken }),
  });
  const data = (await response.json().catch(() => ({}))) as {
    active?: boolean;
    username?: string;
    user_id?: number;
    scope?: string;
    exp?: number;
    error?: string;
  };
  if (!response.ok || !data.active || !data.username || !data.user_id) {
    throw new Error(`COMPUTE_KAGGLE_TOKEN_INVALID:${data.error || response.status}`);
  }
  return {
    username: data.username,
    userId: data.user_id,
    scope: data.scope || "",
    expiresAt: data.exp,
  };
}

export function sha256Base64Url(value: string): string {
  return crypto.createHash("sha256").update(value).digest("base64url");
}

export function createPkceVerifier(): string {
  return crypto.randomBytes(32).toString("base64url");
}
