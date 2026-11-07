import { NextRequest, NextResponse } from "next/server";
import { CanvaConnectionManager } from "@/lib/canva/CanvaConnectionManager";
import { verifySession } from "@/lib/auth/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    let userId = "creator";
    try {
      const { user } = await verifySession(req);
      if (user && user.uid) {
        userId = user.uid;
      }
    } catch {
      // In local dev / unauthenticated mode, continue with creator id
    }

    const origin = req.nextUrl.origin || "http://localhost:3000";
    const redirectUri = process.env.CANVA_REDIRECT_URI || `${origin}/api/canva/callback`;

    // 1. Generate PKCE code verifier and challenge (RFC 7636)
    const { codeVerifier, codeChallenge } = CanvaConnectionManager.generatePkcePair();

    // 2. Generate HMAC-signed OAuth state to prevent CSRF and IDOR
    const { state, nonce } = CanvaConnectionManager.generateState(userId);

    // 3. Generate authorization URL
    const authUrl = CanvaConnectionManager.getAuthorizationUrl({
      redirectUri,
      state,
      codeChallenge,
    });

    const res = NextResponse.json({ success: true, authUrl });

    const isSecure = process.env.NODE_ENV === "production" && !origin.includes("localhost");

    // Bind PKCE verifier and state nonce to HttpOnly cookies for callback verification
    res.cookies.set("canva_pkce_verifier", codeVerifier, {
      httpOnly: true,
      secure: isSecure,
      sameSite: "lax",
      path: "/",
      maxAge: 900, // 15 min
    });

    res.cookies.set("canva_oauth_state", nonce, {
      httpOnly: true,
      secure: isSecure,
      sameSite: "lax",
      path: "/",
      maxAge: 900,
    });

    return res;
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Failed to initiate Canva OAuth." },
      { status: 500 }
    );
  }
}
