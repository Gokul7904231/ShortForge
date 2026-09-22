import { describe, it, expect, beforeEach } from "vitest";
import { UserRepository } from "../../lib/auth/user-repository";
import { isEffectiveAdmin, isAdminUser, isBasicUser } from "../../lib/auth/roles";
import { hashPassword } from "../../lib/auth/password-hasher";

describe("FactoryOS — Admin Portal Toggle & Time-Limited Delegation Suite", () => {
  beforeEach(() => {
    UserRepository._resetForTesting();
  });

  it("1. Basic User vs Admin Role Differentiation", () => {
    expect(isBasicUser("USER")).toBe(true);
    expect(isBasicUser("VIEWER")).toBe(true);
    expect(isBasicUser("ADMIN")).toBe(false);
    expect(isBasicUser("OWNER")).toBe(false);

    expect(isAdminUser("OWNER")).toBe(true);
    expect(isAdminUser("ADMIN")).toBe(true);
    expect(isAdminUser("USER")).toBe(false);
  });

  it("2. Time-Limited Proxy Admin Validation", () => {
    const futureDate = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // +1 hour
    const pastDate = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // -1 hour

    // Active proxy admin
    const activeProxyUser = {
      role: "ADMIN" as const,
      adminExpiresAt: futureDate,
    };
    expect(isEffectiveAdmin(activeProxyUser)).toBe(true);
    expect(isAdminUser(activeProxyUser)).toBe(true);

    // Expired proxy admin
    const expiredProxyUser = {
      role: "ADMIN" as const,
      adminExpiresAt: pastDate,
    };
    expect(isEffectiveAdmin(expiredProxyUser)).toBe(false);
    expect(isAdminUser(expiredProxyUser)).toBe(false);

    // Permanent admin
    const permanentAdmin = {
      role: "ADMIN" as const,
      adminExpiresAt: null,
    };
    expect(isEffectiveAdmin(permanentAdmin)).toBe(true);

    // System Owner
    const ownerUser = {
      role: "OWNER" as const,
      adminExpiresAt: pastDate, // Owner never expires
    };
    expect(isEffectiveAdmin(ownerUser)).toBe(true);
  });

  it("3. Admin Delegation & Time Allocation via UserRepository", async () => {
    const { passwordHash, passwordSalt } = await hashPassword("SecretPass123!");
    
    // Create basic user
    const testUser = await UserRepository.create({
      email: "operator@example.com",
      passwordHash,
      passwordSalt,
      role: "USER",
    });

    expect(testUser.role).toBe("USER");

    // Grant 6 hours proxy admin
    const sixHoursMs = 6 * 60 * 60 * 1000;
    const promotedUser = await UserRepository.grantAdminRole({
      email: "operator@example.com",
      durationMs: sixHoursMs,
      grantedBy: "owner@factoryos.com",
    });

    expect(promotedUser.role).toBe("ADMIN");
    expect(promotedUser.adminExpiresAt).toBeDefined();
    expect(promotedUser.proxyAdminGrantedBy).toBe("owner@factoryos.com");
    expect(isEffectiveAdmin(promotedUser)).toBe(true);

    // Revoke Admin
    const revokedUser = await UserRepository.revokeAdminRole(testUser.id);
    expect(revokedUser?.role).toBe("USER");
    expect(revokedUser?.adminExpiresAt).toBeNull();
    expect(isEffectiveAdmin(revokedUser)).toBe(false);
  });

  it("4. Pre-provisioning Admin for New Email Address", async () => {
    // Pre-grant admin to an email before user registers
    const preGranted = await UserRepository.grantAdminRole({
      email: "newlead@company.com",
      durationMs: 24 * 60 * 60 * 1000, // 24 hours
      grantedBy: "owner@factoryos.com",
    });

    expect(preGranted.email).toBe("newlead@company.com");
    expect(preGranted.role).toBe("ADMIN");
    expect(isEffectiveAdmin(preGranted)).toBe(true);

    // Look up user
    const found = await UserRepository.findByNormalizedEmail("newlead@company.com");
    expect(found).not.toBeNull();
    expect(found?.role).toBe("ADMIN");
  });
});
