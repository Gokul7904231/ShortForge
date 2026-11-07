import { NextRequest, NextResponse } from "next/server";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import { verifySession } from "@/lib/auth/auth";
import { isAdminUser } from "@/lib/auth/roles";
import { SecureTemplatePackImporter } from "@/lib/templates/import/SecureTemplatePackImporter";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate owner / admin access
    let isAuthorized = false;
    try {
      const { user } = await verifySession(req);
      if (isAdminUser(user?.role) || user?.role === "OWNER") {
        isAuthorized = true;
      }
    } catch {
      // In local dev without session cookie, verify if internal authorization header is present or in dev mode
      if (process.env.NODE_ENV !== "production") {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return NextResponse.json(
        { success: false, error: "Unauthorized. Template pack import requires Owner or Admin access." },
        { status: 403 }
      );
    }

    // 2. Read multipart form data
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json(
        { success: false, error: "No file provided in form data ('file' field required)." },
        { status: 400 }
      );
    }

    // Strict size limit before reading full buffer into disk (50 MB)
    const MAX_SIZE = 50 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { success: false, error: `File exceeds maximum allowed upload size of 50 MB (${file.size} bytes).` },
        { status: 400 }
      );
    }

    // 3. Write uploaded file to temporary path
    const tempDir = path.join(os.tmpdir(), "shortforge_pack_uploads");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const tempZipPath = path.join(tempDir, `upload_${Date.now()}_${Math.random().toString(36).substring(2, 9)}.zip`);
    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(tempZipPath, buffer);

    try {
      // 4. Execute sandboxed SecureTemplatePackImporter
      const importer = new SecureTemplatePackImporter();
      const importResult = await importer.importPackFromZip(tempZipPath);

      if (!importResult.success) {
        return NextResponse.json(
          {
            success: false,
            error: importResult.error || "Template pack import failed validation."
          },
          { status: 400 }
        );
      }

      return NextResponse.json({
        success: true,
        message: `Template '${importResult.template?.identity.name}' imported and registered successfully.`,
        template: importResult.template,
        manifest: importResult.manifest,
        assetInventory: importResult.assetInventory
      });
    } finally {
      // Clean up uploaded temporary zip file
      if (fs.existsSync(tempZipPath)) {
        try {
          fs.unlinkSync(tempZipPath);
        } catch {}
      }
    }
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Internal server error during design pack import." },
      { status: 500 }
    );
  }
}

