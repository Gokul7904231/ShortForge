import { NextRequest, NextResponse } from "next/server";
import { CanvaConnectionManager } from "@/lib/canva/CanvaConnectionManager";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const stateParam = searchParams.get("state");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");
  const origin = req.nextUrl.origin || "http://localhost:3000";

  if (error) {
    console.error(`[Canva OAuth Callback Error]: ${error} - ${errorDescription}`);
    return NextResponse.redirect(`${origin}/settings?canva_error=${encodeURIComponent(error)}`);
  }

  if (!code || !stateParam) {
    return NextResponse.redirect(`${origin}/settings?canva_error=missing_oauth_params`);
  }

  try {
    const cookieNonce = req.cookies.get("canva_oauth_state")?.value;
    const codeVerifier = req.cookies.get("canva_pkce_verifier")?.value;

    // 1. Verify OAuth state signature and nonce
    const stateVerification = CanvaConnectionManager.verifyState(stateParam, cookieNonce);
    if (!stateVerification.valid) {
      console.warn(`[Canva OAuth Callback] State verification failed: ${stateVerification.error}`);
      return NextResponse.redirect(`${origin}/settings?canva_error=invalid_state`);
    }

    if (!codeVerifier) {
      console.warn("[Canva OAuth Callback] Missing PKCE code_verifier cookie.");
      return NextResponse.redirect(`${origin}/settings?canva_error=missing_pkce_verifier`);
    }

    const redirectUri = process.env.CANVA_REDIRECT_URI || `${origin}/api/canva/callback`;
    const userId = stateVerification.userId || "creator";

    // 2. Exchange authorization code with PKCE verifier for tokens
    const tokens = await CanvaConnectionManager.exchangeAuthorizationCode({
      code,
      codeVerifier,
      redirectUri,
    });

    // 3. Probe Canva user profile and capabilities
    const [userProfile, capabilities] = await Promise.all([
      CanvaConnectionManager.probeUserProfile(tokens.access_token),
      CanvaConnectionManager.probeUserCapabilities(tokens.access_token),
    ]);

    // 4. Securely store connection in backend (Firebase + local persistent store)
    await CanvaConnectionManager.saveConnection(userId, {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresIn: tokens.expires_in,
      scope: tokens.scope,
      userProfile,
      capabilities,
    });

    const res = NextResponse.redirect(`${origin}/settings?canva=connected`);

    // Clear one-time OAuth cookies
    res.cookies.delete("canva_pkce_verifier");
    res.cookies.delete("canva_oauth_state");

    return res;
  } catch (err: any) {
    console.error("[Canva OAuth Callback Exception]:", err.message);
    return NextResponse.redirect(`${origin}/settings?canva_error=${encodeURIComponent(err.message || "oauth_failed")}`);
  }
}
