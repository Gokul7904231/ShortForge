import { NextRequest, NextResponse } from "next/server";
import { verifyAuthAndRole } from "@/lib/auth/auth";
import { UserRepository } from "@/lib/auth/user-repository";
import { getTreasuryRuntime } from "@/factoryos/core/treasury/TreasuryRuntime";
import { TreasuryQuotaAdmission } from "@/factoryos/core/treasury/TreasuryQuotaAdmission";
import { db } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/users
 * Lists all registered users with paginated quota, Drive status, and usage metrics.
 * Restricted to ADMIN and OWNER.
 */
export async function GET(request: NextRequest) {
  try {
    const caller = await verifyAuthAndRole(request, "ADMIN");
    const { searchParams } = new URL(request.url);

    const search = searchParams.get("search")?.toLowerCase().trim() || "";
    const roleFilter = searchParams.get("role")?.toUpperCase().trim() || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "10", 10)));

    const rawUsers = await UserRepository.listAll();

    // Filter by search & role
    let filtered = rawUsers.filter((u) => {
      const matchesSearch =
        !search ||
        u.email?.toLowerCase().includes(search) ||
        u.name?.toLowerCase().includes(search) ||
        u.id?.toLowerCase().includes(search);
      const matchesRole = !roleFilter || u.role?.toUpperCase() === roleFilter;
      return matchesSearch && matchesRole;
    });

    const totalCount = filtered.length;
    const startIndex = (page - 1) * limit;
    const paginated = filtered.slice(startIndex, startIndex + limit);

    // Enrich with live quota, drive status, and video count
    const enrichedUsers = await Promise.all(
      paginated.map(async (u) => {
        let quota = null;
        let driveStatus = "NOT_CONFIGURED";
        let activeSchedulesCount = 0;
        let totalVideosCount = 0;
        let lastVideoCreatedAt = null;

        try {
          quota = await new TreasuryQuotaAdmission(
            await getTreasuryRuntime(),
          ).getGenerationQuota(u.id, u.role);
        } catch {}

        try {
          // Check drive connection
          const driveDoc = await db.collection("drive_connections").doc(u.id).get();
          if (driveDoc.exists) {
            driveStatus = driveDoc.data()?.status || "CONNECTED";
          }
        } catch {}

        try {
          // Check active schedules
          const schedulesSnap = await db
            .collection("schedules")
            .where("ownerId", "==", u.id)
            .where("enabled", "==", true)
            .get();
          activeSchedulesCount = schedulesSnap.docs.length;
        } catch {}

        try {
          // Check video count & last video
          const videosSnap = await db
            .collection("videos")
            .where("userId", "==", u.id)
            .orderBy("createdAt", "desc")
            .limit(1)
            .get();
          if (!videosSnap.empty) {
            lastVideoCreatedAt = videosSnap.docs[0].data()?.createdAt || null;
          }
          const countSnap = await db.collection("videos").where("userId", "==", u.id).get();
          totalVideosCount = countSnap.docs.length;
        } catch {}

        return {
          id: u.id,
          email: u.email,
          name: u.name || u.email.split("@")[0],
          role: u.role,
          tier: u.role === "ADMIN" || u.role === "OWNER" ? "ADMIN" : (u.role as string) === "PRO" ? "PRO" : "BASIC",
          status: u.status || "ACTIVE",
          createdAt: u.createdAt,
          lastLoginAt: u.lastLoginAt || u.createdAt,
          quota: quota
            ? {
                limit: quota.limit === Infinity ? "Unlimited" : quota.limit,
                completed: quota.completed,
                reserved: quota.reserved,
                totalUsed: quota.totalUsed,
                remaining: quota.remaining === Infinity ? "Unlimited" : quota.remaining,
                periodType: quota.periodType,
                isUnlimited: quota.isUnlimited,
              }
            : null,
          driveStatus,
          activeSchedulesCount,
          totalVideosCount,
          lastVideoCreatedAt,
        };
      })
    );

    return NextResponse.json({
      success: true,
      callerRole: caller.role,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
      users: enrichedUsers,
    });
  } catch (err: any) {
    const isForbidden =
      err.message?.includes("Forbidden") ||
      err.message?.includes("Insufficient permissions") ||
      err.message?.includes("Access denied");
    const status = isForbidden ? 403 : 401;
    return NextResponse.json({ success: false, error: err.message || "Unauthorized" }, { status });
  }
}

/**
 * POST /api/admin/users
 * Grants/promotes an email address to ADMIN role with a specific allowed time duration.
 */
export async function POST(request: NextRequest) {
  try {
    const caller = await verifyAuthAndRole(request, "ADMIN");
    const body = await request.json();
    const { email, durationHours, durationMinutes, isPermanent } = body;

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json({ success: false, error: "A valid email address is required." }, { status: 400 });
    }

    let durationMs: number | null = null;
    if (!isPermanent) {
      const hours = Number(durationHours) || 0;
      const minutes = Number(durationMinutes) || 0;
      const totalMinutes = hours * 60 + minutes;
      if (totalMinutes <= 0) {
        durationMs = 24 * 60 * 60 * 1000;
      } else {
        durationMs = totalMinutes * 60 * 1000;
      }
    }

    const updatedUser = await UserRepository.grantAdminRole({
      email: email.trim(),
      durationMs,
      grantedBy: caller.email,
    });

    const expiryInfo = durationMs
      ? `Access valid for ${durationHours ? `${durationHours}h ` : ""}${durationMinutes ? `${durationMinutes}m` : ""}`.trim()
      : "Permanent Admin access granted.";

    return NextResponse.json({
      success: true,
      message: `Admin access granted to ${email.trim()}. ${expiryInfo}`,
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        role: updatedUser.role,
        adminExpiresAt: updatedUser.adminExpiresAt,
        proxyAdminGrantedBy: updatedUser.proxyAdminGrantedBy,
        proxyAdminGrantedAt: updatedUser.proxyAdminGrantedAt,
      },
    });
  } catch (err: any) {
    const isForbidden =
      err.message?.includes("Forbidden") ||
      err.message?.includes("Insufficient permissions") ||
      err.message?.includes("Access denied");
    const status = isForbidden ? 403 : 401;
    return NextResponse.json({ success: false, error: err.message || "Unauthorized" }, { status });
  }
}
