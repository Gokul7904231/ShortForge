import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { AIDoctor } from "@/lib/core/AIDoctor";
import { verifyAuthAndRole } from "@/lib/auth/auth";

export async function GET(request: NextRequest) {
  try {
    // Internal FactoryOS API: Requires ADMIN or OWNER role
    await verifyAuthAndRole(request, "ADMIN");

    const passportFile = path.resolve(process.cwd(), "data", "model-passports.json");
    if (!fs.existsSync(passportFile)) {
      // Re-run diagnostics to generate if missing
      await AIDoctor.runDiagnosis();
    }
    
    const raw = fs.readFileSync(passportFile, "utf-8");
    const passports = JSON.parse(raw);
    return NextResponse.json({ success: true, models: passports });
  } catch (err: any) {
    console.error("[API /api/models] Caught error:", err?.name, err?.status, err?.message);
    const status =
      err.status ||
      (err.name === "UnauthorizedError" ? 401 : err.name === "ForbiddenError" ? 403 : 500);
    return NextResponse.json({ success: false, error: err.message }, { status });
  }
}
