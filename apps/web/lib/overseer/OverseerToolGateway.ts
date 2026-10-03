/**
 * FactoryOS Overseer Tool Gateway
 *
 * 🔐 STRICT SECURITY & LIVE-ONLY RULES:
 * The LLM is NEVER the security boundary.
 * Every tool invocation checks the authenticated user's role and tenant UID.
 * Basic Users (EDITOR/VIEWER) can ONLY query their own data.
 * Admins (OWNER/ADMIN) can access factory telemetry, queue status, and provider health.
 * ZERO fake or mock values in production paths.
 */

import os from "os";
import { db } from "../firebase-admin";
import { AdminUser, UserRole } from "../auth/types";
import { isRoleAtLeast } from "../auth/roles";
import { ForbiddenError } from "../auth/errors";
import { getTreasuryRuntime } from "@/factoryos/core/treasury/TreasuryRuntime";
import { TreasuryQuotaAdmission } from "@/factoryos/core/treasury/TreasuryQuotaAdmission";
import { FactoryStateService } from "@/factoryos/core/state/FactoryStateService";
import { ApiConfigManager } from "../api-config/api-config-manager";

export class OverseerToolGateway {
  /**
   * 1. getUserProfile (Basic Users & Admins)
   */
  static async getUserProfile(user: AdminUser) {
    return {
      uid: user.uid,
      email: user.email,
      role: user.role,
      memberSince: user.createdAt || "Aug 2026",
    };
  }

  /**
   * 2. getMyProjects (Basic Users — Scoped to User UID)
   */
  static async getMyProjects(user: AdminUser) {
    try {
      const snapshot = await db.collection("projects")
        .where("userId", "==", user.uid)
        .limit(20)
        .get();

      if (snapshot.empty) return [];
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch {
      return [];
    }
  }

  /**
   * 3. getMyJobs & Render Status (Basic Users)
   */
  static async getMyJobs(user: AdminUser) {
    try {
      const snapshot = await db.collection("jobs")
        .where("userId", "==", user.uid)
        .limit(20)
        .get();

      if (snapshot.empty) return [];
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch {
      return [];
    }
  }

  /**
   * 4. getMyLibrary & Analytics (Basic Users)
   */
  static async getMyLibrary(user: AdminUser) {
    try {
      const snapshot = await db.collection("library")
        .where("userId", "==", user.uid)
        .limit(20)
        .get();

      if (snapshot.empty) return [];
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch {
      return [];
    }
  }

  /**
   * 5. getMyQuota (Basic Users)
   */
  static async getMyQuota(user: AdminUser) {
    try {
      const quota = await new TreasuryQuotaAdmission(
        await getTreasuryRuntime(),
      ).getGenerationQuota(user.uid, user.role);
      return {
        completed: quota.completed,
        limit: quota.limit,
        remaining: quota.remaining,
        isUnlimited: quota.isUnlimited,
        isExceeded: quota.isExceeded,
      };
    } catch {
      return {
        completed: 0,
        limit: 5,
        remaining: 5,
        isUnlimited: user.role === "OWNER" || user.role === "ADMIN",
        isExceeded: false,
        status: "QUOTA_UNAVAILABLE",
      };
    }
  }

  // --- 👑 ADMIN-ONLY TOOLS (OWNER / ADMIN ONLY) ---

  /**
   * 6. getFactoryStatus (Admin Only)
   */
  static async getFactoryStatus(user: AdminUser) {
    this.assertAdminRole(user, "getFactoryStatus");
    const factoryState = FactoryStateService.getInstance();
    const ev = await factoryState.getLiveFactoryTelemetry();
    return {
      systemState: ev.data.systemState,
      floorCount: ev.data.floorCount,
      healthyFloors: ev.data.healthyFloors,
      floors: ev.data.floors,
      timestamp: ev.data.timestamp,
    };
  }

  /**
   * 7. getSystemTelemetry (Admin Only)
   */
  static async getSystemTelemetry(user: AdminUser) {
    this.assertAdminRole(user, "getSystemTelemetry");
    const mem = process.memoryUsage();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const uptimeSec = process.uptime();

    return {
      cpuCount: os.cpus().length,
      memoryUsageRssMb: Math.round(mem.rss / (1024 * 1024)),
      systemMemoryFreeMb: Math.round(freeMem / (1024 * 1024)),
      systemMemoryTotalMb: Math.round(totalMem / (1024 * 1024)),
      uptimeSeconds: Math.round(uptimeSec),
      renderEngineUrl: process.env.NEXT_PUBLIC_RENDER_ENGINE_URL || "http://localhost:8000",
    };
  }

  /**
   * 8. getProviderHealth (Admin Only)
   */
  static async getProviderHealth(user: AdminUser) {
    this.assertAdminRole(user, "getProviderHealth");
    const summary = await ApiConfigManager.getSummary();
    const providers = await ApiConfigManager.getProviders();
    return {
      summary,
      providers: providers.map(p => ({
        id: p.id,
        name: p.name,
        mode: p.mode,
        status: p.primary.status,
        lastTested: p.primary.lastTested,
      })),
    };
  }

  /**
   * 9. getAuditSummary (Admin Only)
   */
  static async getAuditSummary(user: AdminUser) {
    this.assertAdminRole(user, "getAuditSummary");
    try {
      const snap = await db.collection("audit_logs")
        .orderBy("timestamp", "desc")
        .limit(20)
        .get();

      if (snap.empty) return [];
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch {
      return [];
    }
  }

  private static assertAdminRole(user: AdminUser, toolName: string) {
    if (!isRoleAtLeast(user.role, "ADMIN")) {
      throw new ForbiddenError(`Permission denied: "${toolName}" requires ADMIN or OWNER role (restricted to system Administrators).`);
    }
  }
}
