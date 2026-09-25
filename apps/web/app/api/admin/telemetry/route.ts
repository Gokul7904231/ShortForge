import { NextResponse } from "next/server";
import { db } from "../../../../lib/firebase-admin";
import { verifyAuthAndRole } from "../../../../lib/auth/auth";
import { ComputeGateway } from "../../../../factoryos/core/compute/gateway/ComputeGateway";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    await verifyAuthAndRole(req, "ADMIN");
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const snapshot = await db
      .collection("videos")
      .where("createdAt", ">=", startOfMonth)
      .get();

    let totalDurationSeconds = 0;
    let totalSizeMb = 0;
    let jobCount = 0;
    let completedCount = 0;

    snapshot.forEach((doc) => {
      const data = doc.data();
      totalDurationSeconds += data.renderDurationSeconds || 0;
      totalSizeMb += data.videoSizeMb || 0;
      jobCount++;
      if (data.status === "completed") completedCount++;
    });

    const computeRouter = ComputeGateway.getInstance().getRouter();
    const providers = await Promise.all(
      computeRouter.getAllProviders().map(async (provider) => ({
        id: provider.id,
        type: provider.type,
        health: await provider.getHealth(),
        capability: await provider.getCapability(),
      }))
    );

    return NextResponse.json({
      success: true,
      month: now.toLocaleString("default", { month: "long", year: "numeric" }),
      infrastructure: {
        authority: "factoryos",
        renderFabric: "core/fabric/RenderFabric",
        routingAuthority: "ComputeRouter",
        providers,
      },
      renderMetrics: {
        totalVideosGenerated: jobCount,
        completedVideos: completedCount,
        totalRenderHours: parseFloat((totalDurationSeconds / 3600).toFixed(2)),
        totalStorageGb: parseFloat((totalSizeMb / 1024).toFixed(2)),
        avgRenderDurationSeconds: jobCount > 0 ? Math.round(totalDurationSeconds / jobCount) : 45,
      },
    });
  } catch (error: any) {
    const isForbidden = error.message?.includes("Forbidden") || error.message?.includes("Role");
    const status = isForbidden ? 403 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}
