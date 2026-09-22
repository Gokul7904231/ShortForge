import { describe, it, expect, beforeEach } from "vitest";
import { AuthService } from "../../lib/auth/AuthService";
import {
  verifySession,
  verifyRole,
  verifyAuthAndRole,
} from "../../lib/auth/auth";
import { createSessionFromIdToken, destroySession } from "../../lib/auth/session";
import { isRoleAtLeast, isValidRole } from "../../lib/auth/roles";
import { hasPermission } from "../../lib/auth/permissions";
import { checkRateLimit, resetRateLimit, validateEmail } from "../../lib/auth/validators";
import {
  UnauthorizedError,
  ForbiddenError,
  AccountDisabledError,
  RateLimitExceededError,
  formatAuthErrorMessage,
} from "../../lib/auth/errors";
import { ALLOWED_BOOTSTRAP_OWNER_EMAIL, SESSION_COOKIE_NAME } from "../../lib/auth/constants";
import { NextRequest } from "next/server";
import { middleware } from "../../middleware";

describe("FactoryOS v1 — Production Authentication & Authorization Suite", () => {
  beforeEach(() => {
    resetRateLimit(`login_${ALLOWED_BOOTSTRAP_OWNER_EMAIL}`);
    resetRateLimit("login_rate_limit_test@factoryos.pro");
  });

  // 0. Firebase Error Message Formatting Tests
  describe("Firebase Auth Error Formatting", () => {
    it("formats raw auth/invalid-credential into a clean user error message", () => {
      const err = new Error("Firebase: Error (auth/invalid-credential).");
      expect(formatAuthErrorMessage(err)).toBe("Invalid email address or password. Please check your credentials and try again.");
    });

    it("formats raw auth/user-not-found into a clean user error message", () => {
      const err = { code: "auth/user-not-found", message: "Firebase: Error (auth/user-not-found)." };
      expect(formatAuthErrorMessage(err)).toBe("No account found matching this email address.");
    });

    it("formats raw auth/too-many-requests into a clean user error message", () => {
      const err = new Error("Firebase: Error (auth/too-many-requests).");
      expect(formatAuthErrorMessage(err)).toBe("Access temporarily blocked due to multiple failed attempts. Please try again in a few minutes.");
    });
  });

  // 1. Role Hierarchy & Validation Tests
  describe("Role Hierarchy & Permissions", () => {
    it("correctly identifies valid role strings", () => {
      expect(isValidRole("OWNER")).toBe(true);
      expect(isValidRole("ADMIN")).toBe(true);
      expect(isValidRole("EDITOR")).toBe(true);
      expect(isValidRole("VIEWER")).toBe(true);
      expect(isValidRole("SUPERMAN")).toBe(false);
    });

    it("evaluates role hierarchy correctly (OWNER > ADMIN > EDITOR > VIEWER)", () => {
      expect(isRoleAtLeast("OWNER", "ADMIN")).toBe(true);
      expect(isRoleAtLeast("ADMIN", "OWNER")).toBe(false);
      expect(isRoleAtLeast("ADMIN", "EDITOR")).toBe(true);
      expect(isRoleAtLeast("VIEWER", "ADMIN")).toBe(false);
      expect(isRoleAtLeast("VIEWER", "VIEWER")).toBe(true);
    });

    it("enforces granular permission capabilities by role", () => {
      expect(hasPermission("OWNER", "admins:manage")).toBe(true);
      expect(hasPermission("ADMIN", "admins:manage")).toBe(false);
      expect(hasPermission("ADMIN", "jobs:cancel")).toBe(true);
      expect(hasPermission("EDITOR", "jobs:cancel")).toBe(false);
      expect(hasPermission("VIEWER", "jobs:view")).toBe(true);
    });
  });

  // 2. Email Validation & Rate Limiting Tests
  describe("Email Validation & Rate Limiting", () => {
    it("validates email formats correctly", () => {
      expect(validateEmail("gokul32499@gmail.com")).toBe(true);
      expect(validateEmail("admin@factoryos.pro")).toBe(true);
      expect(validateEmail("invalid-email")).toBe(false);
      expect(validateEmail("")).toBe(false);
    });

    it("enforces rate limits after repeated login attempts", () => {
      const key = "test_rate_limit_key";
      resetRateLimit(key);

      for (let i = 0; i < 5; i++) {
        expect(checkRateLimit(key, 5, 60000).allowed).toBe(true);
      }

      const blocked = checkRateLimit(key, 5, 60000);
      expect(blocked.allowed).toBe(false);
      expect(blocked.remaining).toBe(0);
    });
  });

  // 3. Server-Side Session Creation & Verification
  describe("Session Lifecycle & Cookie Management", () => {
    it("creates an HTTP-Only session cookie header for valid bootstrap OWNER email", async () => {
      const mockIdToken = "mock_token_owner_id";
      const { cookieHeader, user } = await createSessionFromIdToken(mockIdToken);

      expect(user.email).toBe(ALLOWED_BOOTSTRAP_OWNER_EMAIL);
      expect(user.role).toBe("OWNER");
      expect(user.active).toBe(true);
      expect(user.disabled).toBe(false);

      expect(cookieHeader).toContain(`${SESSION_COOKIE_NAME}=`);
      expect(cookieHeader).toContain("HttpOnly");
      expect(cookieHeader).toContain("Path=/");
    });

    it("generates a logout cookie header that clears the session", async () => {
      const logoutHeader = await destroySession(ALLOWED_BOOTSTRAP_OWNER_EMAIL, "mock_owner_uid");
      expect(logoutHeader).toContain(`${SESSION_COOKIE_NAME}=;`);
      expect(logoutHeader).toContain("Max-Age=0");
    });
  });

  // 4. Server-Side Session & Role Verification Helpers
  describe("Server Verification Helpers (verifySession & verifyRole)", () => {
    it("verifies request with valid session cookie", async () => {
      const req = new NextRequest("http://localhost:3000/api/jobs", {
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=mock_session_cookie_12345`,
        },
      });

      const { user, isSecretKey } = await verifySession(req);
      expect(user.email).toBe(ALLOWED_BOOTSTRAP_OWNER_EMAIL);
      expect(user.role).toBe("OWNER");
      expect(isSecretKey).toBe(false);
    });

    it("authenticates internal services using INTERNAL_API_SECRET_KEY header", async () => {
      process.env.INTERNAL_API_SECRET_KEY = "test_internal_secret_key";
      const req = new NextRequest("http://localhost:3000/api/jobs", {
        headers: {
          authorization: "Bearer test_internal_secret_key",
        },
      });

      const { user, isSecretKey } = await verifySession(req);
      expect(user.role).toBe("OWNER");
      expect(isSecretKey).toBe(true);
    });

    it("throws UnauthorizedError when session cookie is missing", async () => {
      const req = new NextRequest("http://localhost:3000/api/jobs");
      await expect(verifySession(req)).rejects.toThrow(UnauthorizedError);
    });

    it("enforces role requirements in verifyRole", () => {
      const mockAdminUser = {
        uid: "uid_admin",
        email: "admin@factoryos.pro",
        role: "ADMIN" as const,
        active: true,
        disabled: false,
        createdAt: "",
        updatedAt: "",
      };

      expect(() => verifyRole(mockAdminUser, "EDITOR")).not.toThrow();
      expect(() => verifyRole(mockAdminUser, "OWNER")).toThrow(ForbiddenError);
    });

    it("chains verifySession and verifyRole via verifyAuthAndRole", async () => {
      const req = new NextRequest("http://localhost:3000/api/jobs", {
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=mock_session_cookie_12345`,
        },
      });

      const user = await verifyAuthAndRole(req, "ADMIN");
      expect(user.email).toBe(ALLOWED_BOOTSTRAP_OWNER_EMAIL);
    });
  });

  // 5. Middleware Protection Rules
  describe("Next.js Middleware Protection Rules", () => {
    it("allows public endpoints without authentication", () => {
      const publicPaths = ["/", "/login", "/api/health", "/api/published-video"];

      for (const path of publicPaths) {
        const req = new NextRequest(`http://localhost:3000${path}`);
        const res = middleware(req);
        expect(res.status).toBe(200);
      }
    });

    it("redirects unauthenticated UI requests to /login", () => {
      const protectedPaths = ["/dashboard", "/factory/scheduler", "/media/drive"];

      for (const path of protectedPaths) {
        const req = new NextRequest(`http://localhost:3000${path}`);
        const res = middleware(req);
        expect(res.status).toBe(307); // Next.js Temporary Redirect status
        expect(res.headers.get("location")).toContain("/login?redirect=");
      }
    });

    it("returns 401 Unauthorized for unauthenticated API requests", () => {
      const protectedApiPaths = ["/api/jobs", "/api/engines/create", "/api/media/upload"];

      for (const path of protectedApiPaths) {
        const req = new NextRequest(`http://localhost:3000${path}`);
        const res = middleware(req);
        expect(res.status).toBe(401);
      }
    });

    it("allows authenticated API requests with session cookie", () => {
      const req = new NextRequest("http://localhost:3000/api/jobs", {
        headers: {
          cookie: `${SESSION_COOKIE_NAME}=mock_session_cookie_123`,
        },
      });
      const res = middleware(req);
      expect(res.status).toBe(200);
    });
  });

  // 6. Basic User vs Admin Portal Portal Separation
  describe("Basic User vs Admin Portal Separation", () => {
    it("assigns role USER when gokul32499@gmail.com logs in via Basic User portal", async () => {
      const { createSessionForUserAccount } = await import("../../lib/auth/session");
      const { user } = await createSessionForUserAccount(
        {
          id: "usr_gokul_owner",
          email: "gokul32499@gmail.com",
          normalizedEmail: "gokul32499@gmail.com",
          passwordHash: "mock_hash",
          passwordSalt: "mock_salt",
          role: "OWNER",
          status: "ACTIVE",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        "127.0.0.1",
        "Vitest",
        "USER"
      );

      expect(user.role).toBe("USER");
      expect(user.email).toBe("gokul32499@gmail.com");
    });

    it("assigns role OWNER when gokul32499@gmail.com logs in via Admin portal", async () => {
      const { createSessionForUserAccount } = await import("../../lib/auth/session");
      const { user } = await createSessionForUserAccount(
        {
          id: "usr_gokul_owner",
          email: "gokul32499@gmail.com",
          normalizedEmail: "gokul32499@gmail.com",
          passwordHash: "mock_hash",
          passwordSalt: "mock_salt",
          role: "OWNER",
          status: "ACTIVE",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        "127.0.0.1",
        "Vitest",
        "OWNER"
      );

      expect(user.role).toBe("OWNER");
      expect(user.email).toBe("gokul32499@gmail.com");
    });
  });
});
