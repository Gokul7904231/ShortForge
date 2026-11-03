/**
 * CanvaConnectionManager — FactoryOS Canonical Canva Developer Connection & OAuth PKCE Manager
 * 
 * Secure backend-managed OAuth 2.0 with PKCE for Canva Developer Integration.
 * Implements strict zero-exposure credential handling, cryptographic PKCE (RFC 7636),
 * HMAC-signed state validation, capability probing, and automatic token refresh.
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { db } from "../firebase-admin";

export interface CanvaTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

export interface CanvaUserProfile {
  id?: string;
  display_name?: string;
  email?: string;
}

export interface CanvaCapabilitiesReport {
  raw: any;
  grantedScopes: string[];
  canAutofill: boolean;
  canExport: boolean;
  canReadDesigns: boolean;
  canWriteAssets: boolean;
  subscriptionTier: "pro_lite" | "pro" | "team" | "enterprise" | "free" | "unknown";
  timestamp: string;
}

export interface CanvaConnectionRecord {
  userId: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt: number; // Unix timestamp in ms
  scope?: string;
  userProfile?: CanvaUserProfile;
  capabilities?: CanvaCapabilitiesReport;
  connectedAt: string;
  updatedAt: string;
  status: "CONNECTED" | "EXPIRED" | "REVOKED" | "ERROR";
}

export interface CanvaPublicStatus {
  connected: boolean;
  status: "CONNECTED" | "NOT_CONNECTED" | "EXPIRED" | "REVOKED" | "ERROR";
  displayName?: string;
  scope?: string;
  capabilities?: {
    canAutofill: boolean;
    canExport: boolean;
    canReadDesigns: boolean;
    canWriteAssets: boolean;
    subscriptionTier: string;
  };
  expiresInSeconds?: number;
  connectedAt?: string;
  error?: string;
}

const LOCAL_STORE_PATH = path.resolve(process.cwd(), "data", "canva", "connection.json");
const CANVA_AUTH_BASE = "https://www.canva.com/api/oauth/authorize";
const CANVA_API_BASE = "https://api.canva.com/rest/v1";

export const DEFAULT_CANVA_SCOPES = [
  "profile:read",
  "design:content:read",
  "design:meta:read",
  "asset:read",
  "asset:write",
];

export class CanvaConnectionManager {
  private static getClientId(): string {
    const id = process.env.CANVA_CLIENT_ID;
    if (!id) {
      throw new Error("[CanvaConnectionManager] CANVA_CLIENT_ID environment variable is unconfigured.");
    }
    return id.trim();
  }

  private static getClientSecret(): string {
    const secret = process.env.CANVA_CLIENT_SECRET;
    if (!secret) {
      throw new Error("[CanvaConnectionManager] CANVA_CLIENT_SECRET environment variable is unconfigured.");
    }
    return secret.trim();
  }

  /**
   * Generates a cryptographically secure PKCE code verifier and SHA-256 challenge (RFC 7636).
   */
  static generatePkcePair(): { codeVerifier: string; codeChallenge: string } {
    // 32 random bytes -> 43 base64url characters (meets 43-128 char requirement)
    const codeVerifier = crypto.randomBytes(32).toString("base64url");
    const hash = crypto.createHash("sha256").update(codeVerifier).digest();
    const codeChallenge = hash.toString("base64url");
    return { codeVerifier, codeChallenge };
  }

  /**
   * Generates a tamper-proof HMAC-signed OAuth state string.
   */
  static generateState(userId: string = "creator"): { state: string; nonce: string; hmac: string } {
    const secret = process.env.OAUTH_STATE_SECRET || process.env.INTERNAL_API_SECRET_KEY || "sf_canva_oauth_secure_fallback";
    const nonce = crypto.randomBytes(16).toString("hex");
    const hmac = crypto.createHmac("sha256", secret).update(`${nonce}:${userId}`).digest("hex");
    const stateObj = { uid: userId, nonce, hmac, t: Date.now() };
    const state = Buffer.from(JSON.stringify(stateObj)).toString("base64url");
    return { state, nonce, hmac };
  }

  /**
   * Validates state string, checking HMAC signature and replay/expiry (15 min).
   */
  static verifyState(
    stateParam: string,
    cookieNonce?: string
  ): { valid: boolean; userId?: string; error?: string } {
    try {
      const decoded = Buffer.from(stateParam, "base64url").toString("utf-8");
      const { uid, nonce, hmac, t } = JSON.parse(decoded);

      if (!uid || !nonce || !hmac || !t) {
        return { valid: false, error: "Malformed OAuth state payload." };
      }

      // Check expiry: 15 minutes
      if (Date.now() - t > 15 * 60 * 1000) {
        return { valid: false, error: "OAuth state has expired." };
      }

      const secret = process.env.OAUTH_STATE_SECRET || process.env.INTERNAL_API_SECRET_KEY || "sf_canva_oauth_secure_fallback";
      const expectedHmac = crypto.createHmac("sha256", secret).update(`${nonce}:${uid}`).digest("hex");

      const hmacBuffer = Buffer.from(hmac, "utf-8");
      const expectedBuffer = Buffer.from(expectedHmac, "utf-8");

      if (hmacBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(hmacBuffer, expectedBuffer)) {
        return { valid: false, error: "Invalid OAuth state HMAC signature." };
      }

      if (cookieNonce && cookieNonce !== nonce) {
        return { valid: false, error: "OAuth state nonce does not match session cookie." };
      }

      return { valid: true, userId: uid };
    } catch (err: any) {
      return { valid: false, error: err.message || "Failed to decode OAuth state." };
    }
  }

  /**
   * Constructs the official Canva OAuth 2.0 authorization URL.
   */
  static getAuthorizationUrl(params: {
    redirectUri: string;
    state: string;
    codeChallenge: string;
    scopes?: string[];
  }): string {
    const clientId = this.getClientId();
    const scopes = params.scopes || DEFAULT_CANVA_SCOPES;

    const url = new URL(CANVA_AUTH_BASE);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", params.redirectUri);
    url.searchParams.set("scope", scopes.join(" "));
    url.searchParams.set("code_challenge", params.codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("state", params.state);

    return url.toString();
  }

  /**
   * Robust fetch wrapper with rate-limit (HTTP 429) backoff handling.
   */
  static async fetchWithRetry(url: string, init?: RequestInit, maxRetries: number = 3): Promise<Response> {
    let attempt = 0;
    while (attempt < maxRetries) {
      const res = await fetch(url, init);
      if (res.status === 429) {
        attempt++;
        const retryAfterHeader = res.headers?.get("retry-after") || res.headers?.get("Retry-After");
        const retrySeconds = retryAfterHeader ? parseInt(retryAfterHeader, 10) : Math.pow(2, attempt);
        const waitMs = Math.min(30000, Math.max(1000, (isNaN(retrySeconds) ? 2 : retrySeconds) * 1000));
        console.warn(`[CanvaConnectionManager] Canva API 429 Rate Limit encountered. Retrying in ${waitMs}ms (attempt ${attempt}/${maxRetries})...`);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      return res;
    }
    return fetch(url, init);
  }

  /**
   * Exchanges authorization code and PKCE verifier for Canva access and refresh tokens.
   */
  static async exchangeAuthorizationCode(params: {
    code: string;
    codeVerifier: string;
    redirectUri: string;
  }): Promise<CanvaTokenResponse> {
    const clientId = this.getClientId();
    const clientSecret = this.getClientSecret();

    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code: params.code,
      code_verifier: params.codeVerifier,
      redirect_uri: params.redirectUri,
    });

    const res = await this.fetchWithRetry(`${CANVA_API_BASE}/oauth/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`[Canva OAuth Exchange Failed: ${res.status}] ${errText}`);
    }

    return (await res.json()) as CanvaTokenResponse;
  }

  /**
   * Refreshes an expired Canva access token using the refresh token.
   */
  static async refreshAccessToken(refreshToken: string): Promise<CanvaTokenResponse> {
    const clientId = this.getClientId();
    const clientSecret = this.getClientSecret();

    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });

    const res = await this.fetchWithRetry(`${CANVA_API_BASE}/oauth/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`[Canva Token Refresh Failed: ${res.status}] ${errText}`);
    }

    return (await res.json()) as CanvaTokenResponse;
  }

  /**
   * Revokes a Canva token upon disconnect.
   */
  static async revokeToken(token: string): Promise<void> {
    try {
      const clientId = this.getClientId();
      const clientSecret = this.getClientSecret();
      const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

      const body = new URLSearchParams({ token });
      await this.fetchWithRetry(`${CANVA_API_BASE}/oauth/revoke`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${basicAuth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body.toString(),
      });
    } catch (err: any) {
      console.warn(`[CanvaConnectionManager] Token revocation note: ${err.message}`);
    }
  }

  /**
   * Probes user profile via GET /rest/v1/users/me/profile.
   */
  static async probeUserProfile(accessToken: string): Promise<CanvaUserProfile> {
    try {
      const res = await this.fetchWithRetry(`${CANVA_API_BASE}/users/me/profile`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) return { display_name: "Canva Creator" };
      const data = await res.json();
      return {
        id: data.profile?.id || data.id,
        display_name: data.profile?.display_name || data.display_name || "Canva Creator",
      };
    } catch {
      return { display_name: "Canva Creator" };
    }
  }

  /**
   * Probes user capabilities via GET /rest/v1/users/me/capabilities.
   * Accurately determines Autofill availability for Canva Pro Lite accounts.
   */
  static async probeUserCapabilities(accessToken: string): Promise<CanvaCapabilitiesReport> {
    const timestamp = new Date().toISOString();
    try {
      const res = await this.fetchWithRetry(`${CANVA_API_BASE}/users/me/capabilities`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!res.ok) {
        // Fallback default: assume Pro Lite without Autofill
        return {
          raw: null,
          grantedScopes: DEFAULT_CANVA_SCOPES,
          canAutofill: false,
          canExport: true,
          canReadDesigns: true,
          canWriteAssets: true,
          subscriptionTier: "pro_lite",
          timestamp,
        };
      }

      const data = await res.json();
      const caps = Array.isArray(data.capabilities)
        ? data.capabilities
        : Object.keys(data.capabilities || {});

      // In Canva Pro Lite, Autofill is explicitly unavailable
      const canAutofill = caps.some((c: string) => c.toLowerCase().includes("autofill"));
      const canExport = caps.length === 0 || caps.some((c: string) => c.toLowerCase().includes("export") || c.toLowerCase().includes("design"));
      const canReadDesigns = caps.length === 0 || caps.some((c: string) => c.toLowerCase().includes("design") || c.toLowerCase().includes("read"));
      const canWriteAssets = caps.length === 0 || caps.some((c: string) => c.toLowerCase().includes("asset"));

      return {
        raw: data,
        grantedScopes: caps,
        canAutofill,
        canExport,
        canReadDesigns,
        canWriteAssets,
        subscriptionTier: canAutofill ? "pro" : "pro_lite",
        timestamp,
      };
    } catch {
      return {
        raw: null,
        grantedScopes: DEFAULT_CANVA_SCOPES,
        canAutofill: false,
        canExport: true,
        canReadDesigns: true,
        canWriteAssets: true,
        subscriptionTier: "pro_lite",
        timestamp,
      };
    }
  }

  /**
   * Directly persists a connection record to Firebase and local storage.
   */
  static async persistRecord(userId: string, record: CanvaConnectionRecord): Promise<void> {
    // 1. Try Firebase collection
    try {
      await db.collection("canva_connections").doc(userId).set(record, { merge: true });
    } catch {
      // Ignored if Firestore is unconfigured
    }

    // 2. Persist to secure local file store
    try {
      const dir = path.dirname(LOCAL_STORE_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(LOCAL_STORE_PATH, JSON.stringify(record, null, 2), "utf-8");
    } catch (err: any) {
      console.warn(`[CanvaConnectionManager] Local store write note: ${err.message}`);
    }
  }

  /**
   * Retrieves raw stored record without auto-refresh logic.
   */
  static async getRawStoredRecord(userId: string = "creator"): Promise<CanvaConnectionRecord | null> {
    let record: CanvaConnectionRecord | null = null;
    try {
      const doc = await db.collection("canva_connections").doc(userId).get();
      if (doc.exists) {
        record = doc.data() as CanvaConnectionRecord;
      }
    } catch {}

    if (!record && fs.existsSync(LOCAL_STORE_PATH)) {
      try {
        const raw = fs.readFileSync(LOCAL_STORE_PATH, "utf-8");
        record = JSON.parse(raw);
      } catch {}
    }
    return record;
  }

  /**
   * Saves or updates a user's Canva OAuth connection.
   */
  static async saveConnection(
    userId: string,
    data: {
      accessToken: string;
      refreshToken?: string;
      expiresIn: number;
      scope?: string;
      userProfile?: CanvaUserProfile;
      capabilities?: CanvaCapabilitiesReport;
    }
  ): Promise<void> {
    const expiresAt = Date.now() + (data.expiresIn - 60) * 1000; // 60s buffer
    const record: CanvaConnectionRecord = {
      userId,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      expiresAt,
      scope: data.scope,
      userProfile: data.userProfile,
      capabilities: data.capabilities,
      connectedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: "CONNECTED",
    };

    await this.persistRecord(userId, record);
  }

  /**
   * Retrieves an active Canva connection for a user, automatically refreshing expired tokens.
   */
  static async getConnection(userId: string = "creator"): Promise<CanvaConnectionRecord | null> {
    let record = await this.getRawStoredRecord(userId);

    if (!record || record.status !== "CONNECTED") {
      return null;
    }

    // Check token expiry and auto-refresh if necessary
    if (Date.now() >= record.expiresAt && record.refreshToken) {
      try {
        const refreshed = await this.refreshAccessToken(record.refreshToken);
        await this.saveConnection(userId, {
          accessToken: refreshed.access_token,
          refreshToken: refreshed.refresh_token || record.refreshToken,
          expiresIn: refreshed.expires_in,
          scope: refreshed.scope || record.scope,
          userProfile: record.userProfile,
          capabilities: record.capabilities,
        });
        record.accessToken = refreshed.access_token;
        record.expiresAt = Date.now() + (refreshed.expires_in - 60) * 1000;
      } catch (err: any) {
        console.error(`[CanvaConnectionManager] Auto-refresh failed: ${err.message}`);
        const isRevoked = err.message.includes("invalid_grant") || err.message.includes("revoked") || err.message.includes("400") || err.message.includes("401");
        record.status = isRevoked ? "REVOKED" : "EXPIRED";
        record.updatedAt = new Date().toISOString();
        await this.persistRecord(userId, record);
        return null;
      }
    }

    return record;
  }

  /**
   * Disconnects and revokes Canva connection.
   */
  static async disconnect(userId: string = "creator"): Promise<void> {
    const connection = await this.getRawStoredRecord(userId);
    if (connection) {
      if (connection.accessToken) {
        await this.revokeToken(connection.accessToken);
      }
      if (connection.refreshToken) {
        await this.revokeToken(connection.refreshToken);
      }
    }

    try {
      await db.collection("canva_connections").doc(userId).delete();
    } catch {}

    if (fs.existsSync(LOCAL_STORE_PATH)) {
      try {
        fs.unlinkSync(LOCAL_STORE_PATH);
      } catch {}
    }
  }

  /**
   * Returns a sanitized public status of the Canva connection without exposing any secret or token.
   */
  static async getSanitizedStatus(userId: string = "creator"): Promise<CanvaPublicStatus> {
    try {
      const connection = await this.getConnection(userId);
      if (!connection) {
        const raw = await this.getRawStoredRecord(userId);
        if (raw && (raw.status === "EXPIRED" || raw.status === "REVOKED")) {
          return {
            connected: false,
            status: raw.status,
            displayName: raw.userProfile?.display_name,
            scope: raw.scope,
            connectedAt: raw.connectedAt,
          };
        }
        return {
          connected: false,
          status: "NOT_CONNECTED",
        };
      }

      const expiresInSeconds = Math.max(0, Math.floor((connection.expiresAt - Date.now()) / 1000));

      return {
        connected: true,
        status: connection.status,
        displayName: connection.userProfile?.display_name || "Canva Account",
        scope: connection.scope,
        capabilities: connection.capabilities
          ? {
              canAutofill: connection.capabilities.canAutofill,
              canExport: connection.capabilities.canExport,
              canReadDesigns: connection.capabilities.canReadDesigns,
              canWriteAssets: connection.capabilities.canWriteAssets,
              subscriptionTier: connection.capabilities.subscriptionTier,
            }
          : undefined,
        expiresInSeconds,
        connectedAt: connection.connectedAt,
      };
    } catch (err: any) {
      return {
        connected: false,
        status: "ERROR",
        error: err.message,
      };
    }
  }
}
