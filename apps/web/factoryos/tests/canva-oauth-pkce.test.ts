import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CanvaConnectionManager, DEFAULT_CANVA_SCOPES } from "../../lib/canva/CanvaConnectionManager";
import crypto from "crypto";
import fs from "fs";

describe("Canva OAuth 2.0 PKCE & Capability Gate", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.CANVA_CLIENT_ID = "mock_canva_client_id_15chars";
    process.env.CANVA_CLIENT_SECRET = "mock_canva_client_secret_56chars_secure_backend_only_env";
    process.env.OAUTH_STATE_SECRET = "super_secure_state_hmac_secret_key_32chars";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("generates cryptographically valid PKCE verifier and S256 challenge (RFC 7636)", () => {
    const { codeVerifier, codeChallenge } = CanvaConnectionManager.generatePkcePair();

    // Verifier must be 43-128 unreserved characters
    expect(codeVerifier).toBeDefined();
    expect(codeVerifier.length).toBeGreaterThanOrEqual(43);
    expect(codeVerifier.length).toBeLessThanOrEqual(128);
    expect(codeVerifier).toMatch(/^[A-Za-z0-9_-]+$/);

    // Challenge must equal base64url(sha256(verifier))
    const expectedChallenge = crypto
      .createHash("sha256")
      .update(codeVerifier)
      .digest("base64url");
    expect(codeChallenge).toBe(expectedChallenge);
  });

  it("generates and verifies tamper-proof HMAC-signed OAuth state", () => {
    const userId = "test_creator_42";
    const { state, nonce } = CanvaConnectionManager.generateState(userId);

    // Valid state verification with matching cookie nonce
    const result = CanvaConnectionManager.verifyState(state, nonce);
    expect(result.valid).toBe(true);
    expect(result.userId).toBe(userId);

    // Tampered state: modify state payload
    const decoded = JSON.parse(Buffer.from(state, "base64url").toString("utf-8"));
    decoded.uid = "attacker_uid";
    const tamperedState = Buffer.from(JSON.stringify(decoded)).toString("base64url");

    const tamperedResult = CanvaConnectionManager.verifyState(tamperedState, nonce);
    expect(tamperedResult.valid).toBe(false);
    expect(tamperedResult.error).toContain("HMAC signature");

    // Cookie nonce mismatch
    const mismatchedCookieResult = CanvaConnectionManager.verifyState(state, "wrong_cookie_nonce");
    expect(mismatchedCookieResult.valid).toBe(false);
    expect(mismatchedCookieResult.error).toContain("nonce does not match");
  });

  it("rejects expired OAuth states older than 15 minutes", () => {
    const userId = "test_creator";
    const { nonce } = CanvaConnectionManager.generateState(userId);

    const expiredStateObj = {
      uid: userId,
      nonce,
      hmac: crypto
        .createHmac("sha256", process.env.OAUTH_STATE_SECRET!)
        .update(`${nonce}:${userId}`)
        .digest("hex"),
      t: Date.now() - 16 * 60 * 1000, // 16 min ago
    };
    const expiredState = Buffer.from(JSON.stringify(expiredStateObj)).toString("base64url");

    const result = CanvaConnectionManager.verifyState(expiredState, nonce);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("expired");
  });

  it("constructs correct official Canva authorization URL with PKCE parameters", () => {
    const redirectUri = "http://localhost:3000/api/canva/callback";
    const state = "test_state_param";
    const codeChallenge = "test_code_challenge_value";

    const authUrl = CanvaConnectionManager.getAuthorizationUrl({
      redirectUri,
      state,
      codeChallenge,
    });

    const parsed = new URL(authUrl);
    expect(parsed.origin).toBe("https://www.canva.com");
    expect(parsed.pathname).toBe("/api/oauth/authorize");
    expect(parsed.searchParams.get("response_type")).toBe("code");
    expect(parsed.searchParams.get("client_id")).toBe("mock_canva_client_id_15chars");
    expect(parsed.searchParams.get("redirect_uri")).toBe(redirectUri);
    expect(parsed.searchParams.get("code_challenge")).toBe(codeChallenge);
    expect(parsed.searchParams.get("code_challenge_method")).toBe("S256");
    expect(parsed.searchParams.get("state")).toBe(state);

    const scopes = parsed.searchParams.get("scope")?.split(" ");
    expect(scopes).toContain("profile:read");
    expect(scopes).toContain("design:content:read");
    expect(scopes).toContain("design:meta:read");
    expect(scopes).toContain("asset:write");
  });

  it("probes Canva capabilities and correctly identifies Pro Lite restrictions", async () => {
    // Mock Canva capabilities response for Pro Lite (No Autofill)
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        capabilities: [
          "profile:read",
          "design:content:read",
          "design:meta:read",
          "asset:write",
          "asset:read",
        ],
      }),
    });
    global.fetch = mockFetch;

    const report = await CanvaConnectionManager.probeUserCapabilities("mock_access_token");

    expect(report.canAutofill).toBe(false); // Pro Lite restriction enforced!
    expect(report.canExport).toBe(true);
    expect(report.canReadDesigns).toBe(true);
    expect(report.canWriteAssets).toBe(true);
    expect(report.subscriptionTier).toBe("pro_lite");
  });

  it("never exposes client secret, access token, or refresh token in sanitized status", async () => {
    const userId = "test_sanitized_user";
    await CanvaConnectionManager.saveConnection(userId, {
      accessToken: "SECRET_ACCESS_TOKEN_DO_NOT_LEAK",
      refreshToken: "SECRET_REFRESH_TOKEN_DO_NOT_LEAK",
      expiresIn: 3600,
      scope: "profile:read design:content:read",
      userProfile: { display_name: "Gokul Canva Studio" },
      capabilities: {
        raw: {},
        grantedScopes: ["profile:read"],
        canAutofill: false,
        canExport: true,
        canReadDesigns: true,
        canWriteAssets: true,
        subscriptionTier: "pro_lite",
        timestamp: new Date().toISOString(),
      },
    });

    const status = await CanvaConnectionManager.getSanitizedStatus(userId);
    const serialized = JSON.stringify(status);

    expect(status.connected).toBe(true);
    expect(status.displayName).toBe("Gokul Canva Studio");
    expect(status.capabilities?.canAutofill).toBe(false);

    // CRITICAL SECURITY ASSERTION: Zero Secret Leakage
    expect(serialized).not.toContain("SECRET_ACCESS_TOKEN");
    expect(serialized).not.toContain("SECRET_REFRESH_TOKEN");
    expect(serialized).not.toContain(process.env.CANVA_CLIENT_SECRET!);
    expect(serialized).not.toContain("clientSecret");
    expect(serialized).not.toContain("accessToken");
    expect(serialized).not.toContain("refreshToken");
  });

  it("handles 429 rate limit with Retry-After header cleanly", async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return new Response(JSON.stringify({ error: "rate_limit_exceeded" }), {
          status: 429,
          headers: { "Retry-After": "1" },
        });
      }
      return new Response(JSON.stringify({ profile: { id: "u_123", display_name: "Rate Limited User" } }), {
        status: 200,
      });
    });
    global.fetch = mockFetch;

    const profile = await CanvaConnectionManager.probeUserProfile("test_token");
    expect(profile.display_name).toBe("Rate Limited User");
    expect(callCount).toBe(2);
  });

  it("marks connection as REVOKED and persists when token refresh fails with invalid_grant", async () => {
    const userId = "test_revoked_user";
    await CanvaConnectionManager.saveConnection(userId, {
      accessToken: "expired_token",
      refreshToken: "revoked_refresh_token",
      expiresIn: -100, // already expired
      scope: "profile:read",
    });

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ error: "invalid_grant", error_description: "Refresh token revoked by user" }),
    });
    global.fetch = mockFetch;

    const connection = await CanvaConnectionManager.getConnection(userId);
    expect(connection).toBeNull();

    const raw = await CanvaConnectionManager.getRawStoredRecord(userId);
    expect(raw?.status).toBe("REVOKED");

    const status = await CanvaConnectionManager.getSanitizedStatus(userId);
    expect(status.connected).toBe(false);
    expect(status.status).toBe("REVOKED");
  });
});
