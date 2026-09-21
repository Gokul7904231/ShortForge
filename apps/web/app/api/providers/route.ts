import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";
import { UniversalProviderSDK } from "@/lib/providers/UniversalProviderSDK";
import { encrypt } from "@/lib/providers/crypto";
import { AIProviderRegistry } from "@/ai/capability-registry";
import { AIDoctor } from "@/lib/core/AIDoctor";
import { verifyAuthAndRole } from "@/lib/auth/auth";

export async function GET(request: NextRequest) {
  try {
    await verifyAuthAndRole(request, "ADMIN");
    const report = await AIDoctor.getLatestReport();
    let snapshotDocs: any[] = [];
    try {
      const snapshot = await db.collection("providers").get();
      snapshotDocs = snapshot.docs;
    } catch (e: any) {
      console.warn("[API /providers] Firestore read skipped:", e?.message);
    }
    
    const providersList = snapshotDocs.map((doc) => {
      const data = doc.data();
      const reportStatus = report.providerReports.find(r => r.id === doc.id) || {
        status: "OFFLINE" as const,
        latency: 9999,
        modelCount: 0,
        supportsChat: true,
        supportsImage: false,
        supportsVision: false,
        supportsEmbeddings: false,
        supportsAudio: false,
        supportsVideo: false,
      };

      const livePlugin = AIProviderRegistry.getPlugin(doc.id);
      const metrics = livePlugin?.status() || {
        state: reportStatus.status,
        latency: reportStatus.latency,
        avgResponseTime: reportStatus.latency,
        errorRate: 0,
        totalCost: { tokensInput: 0, tokensOutput: 0, estimatedUSD: 0, currency: "USD", pricingSource: "free", lastUpdated: Date.now() },
        retries: 0,
        retryRate: 0,
        quotaRemaining: -1,
        rateLimitLimit: -1,
        rateLimitRemaining: -1,
        rateLimitReset: 0,
        jsonReliability: 1.0,
        lastChecked: Date.now(),
      };

      return {
        id: doc.id,
        name: data.name ?? doc.id,
        baseUrl: data.baseUrl ?? "",
        modelEndpoint: data.modelEndpoint ?? "/chat/completions",
        enabled: data.enabled ?? true,
        metrics,
        capabilities: {
          chat: reportStatus.supportsChat,
          image: reportStatus.supportsImage,
          vision: reportStatus.supportsVision,
          embeddings: reportStatus.supportsEmbeddings,
          audio: reportStatus.supportsAudio,
          video: reportStatus.supportsVideo,
        },
        modelCount: reportStatus.modelCount,
      };
    });

    // Add hardcoded active plugins
    const plugins = AIProviderRegistry.getAllPlugins();
    for (const plugin of plugins) {
      const pluginId = plugin.id === "google-ai" ? "google" : plugin.id;
      if (!providersList.some((p) => p.id === pluginId && p.id !== "google")) {
        const reportStatus = report.providerReports.find(r => r.id === plugin.id) || {
          status: "ONLINE" as const,
          latency: 0,
          modelCount: 5,
          supportsChat: true,
          supportsImage: false,
          supportsVision: false,
          supportsEmbeddings: false,
          supportsAudio: false,
          supportsVideo: false,
        };

        providersList.push({
          id: plugin.id,
          name: plugin.name,
          baseUrl: (plugin as any).baseUrl ?? "—",
          modelEndpoint: (plugin as any).modelEndpoint ?? "—",
          enabled: true,
          metrics: plugin.status(),
          capabilities: {
            chat: reportStatus.supportsChat,
            image: reportStatus.supportsImage,
            vision: reportStatus.supportsVision,
            embeddings: reportStatus.supportsEmbeddings,
            audio: reportStatus.supportsAudio,
            video: reportStatus.supportsVideo,
          },
          modelCount: reportStatus.modelCount,
        });
      }
    }

    return NextResponse.json({ success: true, providers: providersList });
  } catch (err: any) {
    console.error("[API /providers] Error listing providers:", err.message);
    const status = err.status || (err.name === "UnauthorizedError" ? 401 : err.name === "ForbiddenError" ? 403 : 500);
    return NextResponse.json({ success: false, error: err.message }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    await verifyAuthAndRole(request, "ADMIN");
    const body = await request.json();
    const { id, name, apiKey, baseUrl, modelEndpoint, optionalHeaders } = body;

    if (!id || !name || !baseUrl) {
      return NextResponse.json({ success: false, error: "Missing required fields: id, name, baseUrl" }, { status: 400 });
    }

    const encryptedKey = apiKey ? encrypt(apiKey) : "";

    const docData = {
      name,
      apiKey: encryptedKey,
      baseUrl,
      modelEndpoint: modelEndpoint || "/chat/completions",
      optionalHeaders: optionalHeaders || {},
      enabled: true,
      createdAt: new Date().toISOString(),
    };

    // Save metadata and encrypted key to Firestore
    await db?.collection("providers").doc(id).set(docData, { merge: true });

    // Instantly load/register in the live registry
    await UniversalProviderSDK.register({
      id,
      name,
      apiKey: encryptedKey,
      baseUrl,
      modelEndpoint: docData.modelEndpoint,
      optionalHeaders: docData.optionalHeaders,
    });

    return NextResponse.json({ success: true, message: `Provider "${name}" registered successfully.` });
  } catch (err: any) {
    console.error("[API /providers] Save failed:", err.message);
    const status = err.status || (err.name === "UnauthorizedError" ? 401 : err.name === "ForbiddenError" ? 403 : 500);
    return NextResponse.json({ success: false, error: err.message }, { status });
  }
}
