import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth/auth";
import {
  exchangeKaggleCode,
  verifyKaggleOAuthState,
  isKaggleOAuthConfigured,
} from "@/factoryos/core/compute/connections/KaggleOAuthService";
import { computeConnectionService } from "@/factoryos/core/compute/connections";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function errorRedirect(req: NextRequest, code: string, message?: string) {
  const url = new URL("/settings/compute", req.url);
  url.searchParams.set("kaggle", code);
  if (message) url.searchParams.set("message", message.slice(0, 160));
  const response = NextResponse.redirect(url);
  response.cookies.delete("kaggle_oauth_state");
  return response;
}

export async function GET(req: NextRequest) {
  if (!isKaggleOAuthConfigured()) {
    return errorRedirect(req, "oauth_unavailable");
  }

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const providerError = searchParams.get("error");
  const providerErrorDescription = searchParams.get("error_description");

  if (providerError) {
    return errorRedirect(
      req,
      "oauth_denied",
      providerErrorDescription || providerError,
    );
  }
  if (!code || !state) {
    return errorRedirect(req, "oauth_invalid_callback", "Missing authorization code or state.");
  }

  try {
    const { user } = await verifySession(req);
    const cookieValue = req.cookies.get("kaggle_oauth_state")?.value;
    const codeVerifier = verifyKaggleOAuthState(state, cookieValue, user.uid);

    const redirectUri =
      process.env.KAGGLE_OAUTH_REDIRECT_URI ||
      `${req.nextUrl.origin}/api/compute/connections/oauth/kaggle/callback`;
    const tokens = await exchangeKaggleCode(code, redirectUri, codeVerifier);

    if (!tokens.access_token || !tokens.refresh_token || !tokens.username || !tokens.user_id) {
      throw new Error("COMPUTE_KAGGLE_OAUTH_TOKEN_RESPONSE_INCOMPLETE");
    }

    const expiresAt = tokens.expires_in
      ? Date.now() + tokens.expires_in * 1000
      : undefined;

    await computeConnectionService.createOAuth(user, {
      providerId: "notebook_kaggle",
      displayName: `Kaggle — ${tokens.username}`,
      externalAccountId: String(tokens.user_id),
      credentials: {
        KAGGLE_API_TOKEN: tokens.access_token,
        KAGGLE_REFRESH_TOKEN: tokens.refresh_token,
        KAGGLE_USERNAME: tokens.username,
        KAGGLE_USER_ID: String(tokens.user_id),
        ...(expiresAt ? { KAGGLE_TOKEN_EXPIRES_AT: String(expiresAt) } : {}),
      },
      metadata: {
        kaggleUsername: tokens.username,
        kaggleUserId: String(tokens.user_id),
        kaggleScopes: tokens.scope || "",
        authSource: "kaggle-oauth",
      },
    });

    const response = NextResponse.redirect(
      new URL("/settings/compute?kaggle=connected", req.url),
    );
    response.cookies.delete("kaggle_oauth_state");
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Kaggle OAuth connection failed";
    return errorRedirect(req, "oauth_error", message);
  }
}
