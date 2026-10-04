import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth/auth";
import {
  buildKaggleAuthorizationUrl,
  createKaggleOAuthState,
  createPkceVerifier,
  isKaggleOAuthConfigured,
  kaggleOAuthClientType,
  sha256Base64Url,
} from "@/factoryos/core/compute/connections/KaggleOAuthService";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const { user } = await verifySession(req);
    if (!isKaggleOAuthConfigured()) {
      return NextResponse.redirect(new URL("/settings/compute?kaggle=oauth_unavailable", req.url));
    }

    const redirectUri =
      process.env.KAGGLE_OAUTH_REDIRECT_URI ||
      `${req.nextUrl.origin}/api/compute/connections/oauth/kaggle/callback`;

    const publicClient = kaggleOAuthClientType() === "PUBLIC";
    const codeVerifier = publicClient ? createPkceVerifier() : undefined;
    const codeChallenge = codeVerifier ? sha256Base64Url(codeVerifier) : undefined;
    const { state, cookieValue } = createKaggleOAuthState(user.uid, codeVerifier);
    const authorizationUrl = buildKaggleAuthorizationUrl(
      redirectUri,
      state,
      codeChallenge,
    );

    const response = NextResponse.redirect(authorizationUrl);
    response.cookies.set("kaggle_oauth_state", cookieValue, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "OAuth initialization failed";
    return NextResponse.redirect(
      new URL(
        `/settings/compute?kaggle=oauth_error&message=${encodeURIComponent(message.slice(0, 160))}`,
        req.url,
      ),
    );
  }
}
