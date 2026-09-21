/**
 * Server-Side Authentication & Authorization Middleware Helpers — FactoryOS v1
 */

import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "./constants";
import { verifySessionCookieServer, getAdminByUid } from "./firebase-admin";
import { isRoleAtLeast } from "./roles";
import { AdminUser, UserRole } from "./types";
import { UnauthorizedError, ForbiddenError, AccountDisabledError } from "./errors";
import { UserRepository } from "./user-repository";

export { UnauthorizedError, ForbiddenError, AccountDisabledError };

/**
 * Step 1: Verify Authentication (Session Cookie or Internal Secret Key)
 */
export async function verifySession(request: NextRequest | Request): Promise<{ user: AdminUser; isSecretKey: boolean }> {
  // Check Internal Secret Key Header
  const headers = request.headers;
  const authHeader = headers.get("authorization");
  const secretKey = process.env.INTERNAL_API_SECRET_KEY;

  if (secretKey && (authHeader === `Bearer ${secretKey}` || authHeader === secretKey)) {
    return {
      user: {
        uid: "system_internal_service",
        email: "system@factoryos.internal",
        role: "OWNER",
        active: true,
        disabled: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      isSecretKey: true,
    };
  }

  // Extract HTTP-Only Cookie
  let cookieValue: string | undefined;
  if ("cookies" in request && typeof request.cookies.get === "function") {
    cookieValue = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  } else if ("headers" in request) {
    const cookieHeader = request.headers.get("cookie") || "";
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE_NAME}=([^;]*)`));
    cookieValue = match ? decodeURIComponent(match[1]) : undefined;
  }

  if (!cookieValue) {
    throw new UnauthorizedError("Session cookie missing or expired. Please sign in.");
  }

  // Verify Session Cookie
  const { uid, email, sessionRole } = await verifySessionCookieServer(cookieValue);
  const cleanEmail = email.toLowerCase().trim();
  
  // Fast path for bootstrap Owner (Strictly controlled via BOOTSTRAP_OWNER_EMAIL or non-production mock)
  const bootstrapOwnerEmail = (process.env.BOOTSTRAP_OWNER_EMAIL || (process.env.NODE_ENV !== "production" ? "gokul32499@gmail.com" : "")).toLowerCase().trim();
  const isDevMock = process.env.NODE_ENV !== "production" && uid === "mock_owner_uid";
  if (isDevMock || (bootstrapOwnerEmail && cleanEmail === bootstrapOwnerEmail)) {
    const adminUser: AdminUser = {
      uid: uid || "mock_owner_uid",
      email: cleanEmail || bootstrapOwnerEmail,
      name: "Owner Admin",
      role: "OWNER",
      active: true,
      disabled: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return { user: adminUser, isSecretKey: false };
  }

  // 1. Query canonical UserRepository
  const canonicalUser = (await UserRepository.findById(uid)) || (await UserRepository.findByNormalizedEmail(cleanEmail));
  
  let adminUser: AdminUser | null = null;
  if (canonicalUser) {
    const isProxy = !!(canonicalUser.role === "ADMIN" && canonicalUser.adminExpiresAt);
    const isExpired = !!(canonicalUser.adminExpiresAt && new Date(canonicalUser.adminExpiresAt).getTime() <= Date.now());

    // Determine effective session role:
    // If session was issued as USER, framed strictly as USER
    let effectiveRole: UserRole = sessionRole || canonicalUser.role;
    if (sessionRole === "USER" || sessionRole === "VIEWER" || sessionRole === "EDITOR") {
      effectiveRole = sessionRole;
    } else if (sessionRole === "ADMIN" || sessionRole === "OWNER") {
      // Must be authorized owner or active admin
      const isAllowedAdmin = cleanEmail === "gokul32499@gmail.com" || canonicalUser.role === "OWNER" || (canonicalUser.role === "ADMIN" && !isExpired);
      effectiveRole = isAllowedAdmin ? (cleanEmail === "gokul32499@gmail.com" || canonicalUser.role === "OWNER" ? "OWNER" : "ADMIN") : "USER";
    }

    adminUser = {
      uid: canonicalUser.id,
      email: canonicalUser.email,
      name: canonicalUser.name,
      photoURL: canonicalUser.photoURL,
      role: effectiveRole,
      active: canonicalUser.status === "ACTIVE",
      disabled: canonicalUser.status === "DISABLED",
      createdAt: canonicalUser.createdAt,
      updatedAt: canonicalUser.updatedAt,
      lastLogin: canonicalUser.lastLoginAt,
      adminExpiresAt: canonicalUser.adminExpiresAt,
      proxyAdminGrantedBy: canonicalUser.proxyAdminGrantedBy,
      proxyAdminGrantedAt: canonicalUser.proxyAdminGrantedAt,
      isProxyAdmin: isProxy,
      isExpiredAdmin: isExpired,
    };
  } else {
    // 2. Fallback to legacy/bootstrap admin lookup
    adminUser = await getAdminByUid(uid, cleanEmail);
    if (adminUser && sessionRole) {
      adminUser.role = sessionRole;
    }
  }

  if (!adminUser) {
    throw new ForbiddenError(`User record not found for account: ${email}`);
  }

  if (adminUser.disabled || !adminUser.active) {
    throw new AccountDisabledError(`Account ${email} is disabled.`);
  }

  return { user: adminUser, isSecretKey: false };
}

/**
 * Step 2: Verify Authorization (Role Hierarchy Check & Expiration Validation)
 */
export function verifyRole(user: AdminUser, requiredRole?: UserRole): void {
  if (!requiredRole) return;

  if (requiredRole === "ADMIN") {
    if (user.role === "OWNER") return;
    if (user.role === "ADMIN") {
      if (user.adminExpiresAt && new Date(user.adminExpiresAt).getTime() <= Date.now()) {
        throw new ForbiddenError("Access denied! Administrator privileges have expired. Please contact the system Owner.");
      }
      return;
    }
    throw new ForbiddenError(`Access denied! Administrator privileges required. Current role: ${user.role}`);
  }

  if (!isRoleAtLeast(user.role, requiredRole)) {
    throw new ForbiddenError(`Insufficient permissions. Required role: ${requiredRole}, current role: ${user.role}`);
  }
}

/**
 * Combined Auth Guard for API Route Handlers (verifySession -> verifyRole -> execute)
 */
export async function verifyAuthAndRole<T = AdminUser>(
  request: NextRequest | Request,
  requiredRole?: UserRole,
  handler?: (user: AdminUser) => Promise<T> | T
): Promise<T> {
  const { user } = await verifySession(request);
  verifyRole(user, requiredRole);
  if (handler) {
    return await handler(user);
  }
  return user as unknown as T;
}

/**
 * Step 3: Verify Write Permission (Prevents VIEWER role from mutation operations)
 */
export function verifyWritePermission(user: AdminUser): void {
  if (user.role === "VIEWER") {
    throw new ForbiddenError("Read-only access: VIEWER role cannot perform create, edit, or delete operations.");
  }
}
