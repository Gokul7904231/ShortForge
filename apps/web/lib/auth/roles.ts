/**
 * Role Definitions & Hierarchy Validation — FactoryOS v1
 */

import { UserRole } from "./types";
import { ROLE_HIERARCHY } from "./constants";

export type { UserRole };

export function isRoleAtLeast(currentRole: UserRole, requiredRole: UserRole): boolean {
  const currentWeight = ROLE_HIERARCHY[currentRole] || 0;
  const requiredWeight = ROLE_HIERARCHY[requiredRole] || 0;
  return currentWeight >= requiredWeight;
}

export function isValidRole(role: string): role is UserRole {
  return ["OWNER", "ADMIN", "USER", "EDITOR", "VIEWER"].includes(role);
}

export function isOwnerUser(role?: UserRole | string | null): boolean {
  if (!role) return false;
  return role === "OWNER";
}

/**
 * Checks if a user has active Admin or Owner authority, taking time-limited proxy admin expiration into account.
 */
export function isEffectiveAdmin(user?: { role?: UserRole | string | null; adminExpiresAt?: string | null } | null): boolean {
  if (!user || !user.role) return false;
  if (user.role === "OWNER") return true;
  if (user.role === "ADMIN") {
    if (user.adminExpiresAt) {
      return new Date(user.adminExpiresAt).getTime() > Date.now();
    }
    return true;
  }
  return false;
}

export function isAdminUser(userOrRole?: { role?: UserRole | string | null; adminExpiresAt?: string | null } | UserRole | string | null): boolean {
  if (!userOrRole) return false;
  if (typeof userOrRole === "object") {
    return isEffectiveAdmin(userOrRole);
  }
  return userOrRole === "OWNER" || userOrRole === "ADMIN";
}

export function isBasicUser(role?: UserRole | string | null): boolean {
  if (!role) return true;
  return role === "USER" || role === "EDITOR" || role === "VIEWER";
}

export function isEditorUser(role?: UserRole | string | null): boolean {
  if (!role) return false;
  return role === "EDITOR";
}

export function isViewerUser(role?: UserRole | string | null): boolean {
  if (!role) return false;
  return role === "VIEWER";
}

export function canWrite(role?: UserRole | string | null): boolean {
  if (!role) return false;
  return role !== "VIEWER";
}

