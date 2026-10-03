import { NextRequest, NextResponse } from "next/server";
import { verifyAuthAndRole } from "@/lib/auth/auth";
import { UserRepository } from "@/lib/auth/user-repository";
import { getTreasuryRuntime } from "@/factoryos/core/treasury/TreasuryRuntime";
import { TreasuryQuotaAdmission } from "@/factoryos/core/treasury/TreasuryQuotaAdmission";
import { db } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/users/[userId]
 * Deep inspection of user profile, quota ledger, videos, active schedules, and Drive status.
 * Restricted to ADMIN and OWNER.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const caller = await verifyAuthAndRole(request, "ADMIN");
    const { userId } = await params;

    if (!userId) {
      return NextResponse.json({ success: false, error: "Missing userId parameter" }, { status: 400 });
    }

    const user = await UserRepository.findById(userId);
    if (!user) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    // 1. Quota Ledger
    let quota = null;
    try {
      quota = await new TreasuryQuotaAdmission(
        await getTreasuryRuntime(),
      ).getGenerationQuota(user.id, user.role);
    } catch {}

    // 2. Drive Connection Status (redacted tokens)
    let driveConnection = null;
    try {
      const driveDoc = await db.collection("drive_connections").doc(user.id).get();
      if (driveDoc.exists) {
        const data = driveDoc.data() || {};
        driveConnection = {
          status: data.status || "CONNECTED",
          googleEmail: data.googleEmail || "Connected Google Account",
          selectedFolderName: data.selectedFolderName || "Root / Default",
          selectedFolderId: data.selectedFolderId || null,
          connectedAt: data.connectedAt || null,
          lastValidatedAt: data.lastValidatedAt || null,
        };
      }
    } catch {}

    // 3. User Schedules
    let schedules: any[] = [];
    try {
      const schedSnap = await db.collection("schedules").where("ownerId", "==", user.id).get();
      schedules = schedSnap.docs.map((doc: any) => ({
        id: doc.id,
        ...doc.data(),
      }));
    } catch {}

    // 4. User Videos History
    let videos: any[] = [];
    try {
      const vidSnap = await db
        .collection("videos")
        .where("userId", "==", user.id)
        .orderBy("createdAt", "desc")
        .limit(20)
        .get();
      videos = vidSnap.docs.map((doc: any) => ({
        id: doc.id,
        ...doc.data(),
      }));
    } catch {}

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tier: user.role === "ADMIN" || user.role === "OWNER" ? "ADMIN" : (user.role as string) === "PRO" ? "PRO" : "BASIC",
        status: user.status,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
        adminExpiresAt: user.adminExpiresAt,
      },
      quota,
      driveConnection,
      schedules,
      videos,
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
