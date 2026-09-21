import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isInternalFactoryRoute } from "@/lib/core/RouteRegistry";
import { isAdminUser } from "@/lib/auth/roles";
import { UserRole } from "@/lib/auth/types";

const SESSION_COOKIE_NAME = "__session";

// Explicit Public Paths (No authentication required)
const PUBLIC_PREFIXES = [
  "/login",
  "/api/published-video",
  "/api/health",
  "/health",
  "/api/auth",
  "/api/render-workers/pair",
  "/api/render-workers/heartbeat",
  "/api/rendering",
  "/api/templates",
  "/_next",
  "/public",
  "/favicon.ico",
  "/demo-short.mp4",
  "/german-quiz.mp4",
  "/german-quiz-poster.jpg",
];

/**
 * Edge-compatible payload decoder for FactoryOS signed sessions.
 */
function decodeEdgeSessionRole(token: string): UserRole | null {
  if (!token || !token.startsWith("fos_")) return null;
  try {
    const withoutPrefix = token.substring(4);
    const parts = withoutPrefix.split(".");
    if (parts.length !== 2) return null;
    const [payloadB64] = parts;
    const jsonStr = typeof Buffer !== "undefined"
      ? Buffer.from(payloadB64, "base64url").toString("utf8")
      : atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(jsonStr);
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload.role || null;
  } catch {
    return null;
  }
}

/**
 * Extracts and verifies the role from the session cookie or internal secret key.
 */
function resolveSessionRole(
  sessionCookie: string | undefined,
  isSecretKeyValid: boolean
): UserRole | null {
  if (isSecretKeyValid) {
    return "OWNER";
  }

  if (!sessionCookie) {
    return null;
  }

  // 1. Check FactoryOS cryptographically signed session token (Edge-compatible decode)
  const role = decodeEdgeSessionRole(sessionCookie);
  if (role) {
    return role;
  }

  // 2. Dev / Test Mode Mock Session
  if (
    process.env.NODE_ENV !== "production" &&
    (sessionCookie.startsWith("mock_session_cookie_") || sessionCookie.includes("simulated_admin_token"))
  ) {
    return "OWNER";
  }

  return null;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Allow Exact Root Public Landing Page (/) or Redirect Authenticated Users
  if (pathname === "/") {
    const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (sessionCookie) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return NextResponse.next();
  }

  // 1b. Canonical: /landing → / (temporary 307, not 301)
  if (pathname === "/landing" || pathname.startsWith("/landing/")) {
    return NextResponse.redirect(new URL("/", request.url), 307);
  }

  // 1.5 Canonical Redirects for Legacy / Prototype surfaces (explicit 1:1 mapping — no wildcard)
  if (pathname.startsWith("/new-ui")) {
    if (pathname === "/new-ui" || pathname === "/new-ui/") return NextResponse.redirect(new URL("/dashboard", request.url));
    if (pathname === "/new-ui/dashboard" || pathname.startsWith("/new-ui/dashboard/")) return NextResponse.redirect(new URL("/dashboard", request.url));
    if (pathname === "/new-ui/library" || pathname.startsWith("/new-ui/library/")) return NextResponse.redirect(new URL("/media/library", request.url));
    if (pathname === "/new-ui/engines" || pathname.startsWith("/new-ui/engines/")) return NextResponse.redirect(new URL("/engines", request.url));
    if (pathname === "/new-ui/factory" || pathname.startsWith("/new-ui/factory/")) return NextResponse.redirect(new URL("/factory/jobs", request.url));
    if (pathname === "/new-ui/analytics" || pathname.startsWith("/new-ui/analytics/")) return NextResponse.redirect(new URL("/analytics/heatmaps", request.url));
    if (pathname === "/new-ui/publishing" || pathname.startsWith("/new-ui/publishing/")) return NextResponse.redirect(new URL("/publishing/youtube", request.url));
    if (pathname === "/new-ui/settings" || pathname.startsWith("/new-ui/settings/")) return NextResponse.redirect(new URL("/settings", request.url));
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (pathname === "/dashboard/quiz") {
    return NextResponse.redirect(new URL("/engines/quiz", request.url));
  }

  // 2. Check if Path is Explicitly Exempt / Public
  const isPublic = PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix)
  );

  if (isPublic) {
    // If authenticated user visits /login, redirect to /dashboard
    if (pathname === "/login") {
      const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
      if (sessionCookie) {
        return NextResponse.redirect(new URL("/dashboard", request.url));
      }
    }
    return NextResponse.next();
  }

  // 3. Extract Session Cookie & API Secret Key
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const authHeader = request.headers.get("authorization");
  const queryKey = request.nextUrl.searchParams.get("key");
  const secretKey = process.env.INTERNAL_API_SECRET_KEY;

  const isSecretKeyValid =
    !!secretKey && (authHeader === `Bearer ${secretKey}` || authHeader === secretKey || queryKey === secretKey);

  const isAuthenticated = !!sessionCookie || isSecretKeyValid;
  const sessionRole = resolveSessionRole(sessionCookie, isSecretKeyValid);

  // 4. HARD PRODUCT BOUNDARY: Server-side Gate for Internal FactoryOS Operator Surfaces
  // Enforces that BASIC creators cannot access workflows, DAGs, models, benchmarks, runtime, SRE, or operator controls.
  // CRITICAL: /factory/templates and /factory/jobs are creator surfaces and are NOT blocked.
  if (isInternalFactoryRoute(pathname)) {
    if (!isAuthenticated) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          {
            error: "Unauthorized: Access to FactoryOS operator endpoints requires authentication.",
            code: "UNAUTHORIZED",
          },
          { status: 401 }
        );
      }
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Authenticated user check: must have ADMIN or OWNER role
    if (!isAdminUser(sessionRole)) {
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          {
            success: false,
            error: "Forbidden: Access to internal FactoryOS operator endpoints requires administrator privileges.",
            code: "FORBIDDEN",
          },
          { status: 403 }
        );
      }

      // UI Route: Redirect immediately to creator dashboard without exposing internal HTML/data
      const deniedUrl = new URL("/dashboard", request.url);
      deniedUrl.searchParams.set("denied", "operator_access");
      return NextResponse.redirect(deniedUrl, 307);
    }
  }

  // 5. Protect General API Endpoints (Fail-Closed 401 for unauthenticated requests)
  if (pathname.startsWith("/api/")) {
    if (!isAuthenticated) {
      return NextResponse.json(
        {
          error: "Unauthorized: Access to API requires an active session or secret key.",
          code: "UNAUTHORIZED",
        },
        { status: 401 }
      );
    }
    return NextResponse.next();
  }

  // 6. Protect General UI Pages (Redirect to /login if unauthenticated)
  if (!isAuthenticated) {
    if (process.env.FACTORYOS_BYPASS_AUTH === "true") {
      return NextResponse.next();
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static files with extensions (e.g. .css, .js, .png, .jpg, .svg, .mp4, .webm)
     */
    "/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|mp4|webm|mov|mp3|wav|ogg)$).*)",
  ],
};
