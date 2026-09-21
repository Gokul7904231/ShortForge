import { NextRequest, NextResponse } from "next/server";
import { VoiceFabric } from "@/factoryos/core/voice/VoiceFabric";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const engineId = body.engineId || "GEMINI";
    const phrase = body.phrase || "FactoryOS voice synthesis verification test.";
    const allowFallback = body.allowFallback !== false;

    const fabric = new VoiceFabric();
    const profile = fabric.getProfile("profile_narrator_dramatic");

    const artifact = await fabric.synthesize(
      phrase,
      { ...profile, preferredEngine: engineId },
      { allowFallback }
    );

    const isDegraded = artifact.qualityClass === "DEGRADED_FALLBACK" || artifact.isFallback;

    return NextResponse.json({
      success: true,
      executionId: artifact.factoryExecutionId,
      provider: artifact.provider,
      artifactId: artifact.artifactId,
      artifactSha256: artifact.sha256,
      byteLength: artifact.byteLength,
      durationSeconds: artifact.durationSeconds,
      codec: artifact.codec,
      providerExecutionStatus: artifact.success ? (isDegraded ? "DEGRADED_FALLBACK" : "SUCCESS") : "FAILED",
      actualSynthesisStatus: isDegraded ? "DEGRADED_FALLBACK" : "REAL_SYNTHESIS",
      qualityClass: artifact.qualityClass,
      verificationState: isDegraded ? "DEGRADED_FALLBACK" : "ARTIFACT_VERIFIED",
    });
  } catch (err: any) {
    const isAuth =
      err.code === "VOICE_AUTHENTICATION_FAILED" ||
      err.message?.includes("API_KEY_INVALID") ||
      err.message?.includes("authentication") ||
      err.message?.includes("401");
    const isCred =
      err.message?.includes("LIVE_PROVIDER_REQUIRED") ||
      err.message?.includes("credentials");
    const isTimeout =
      err.code === "VOICE_PROVIDER_TIMEOUT" ||
      err.message?.includes("timed out") ||
      err.message?.includes("TIMEOUT");

    return NextResponse.json(
      {
        success: false,
        error: err.message,
        code: isAuth
          ? "AUTHENTICATION_FAILED"
          : isCred
          ? "CREDENTIALS_REQUIRED"
          : isTimeout
          ? "TIMEOUT"
          : "FAILED",
        verificationState: isAuth
          ? "AUTH_FAILED"
          : isCred
          ? "CREDENTIALS_REQUIRED"
          : isTimeout
          ? "TIMEOUT"
          : "FAILED",
        providerExecutionStatus: "FAILED",
        actualSynthesisStatus: "UNAVAILABLE",
      },
      { status: isAuth ? 401 : isCred ? 409 : isTimeout ? 504 : 502 }
    );
  }
}
