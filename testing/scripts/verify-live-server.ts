import fs from "fs";
import path from "path";

// Load apps/web/.env manually without external dotenv dependency
try {
  const envContent = fs.readFileSync(path.resolve(__dirname, "../../apps/web/.env"), "utf8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("INTERNAL_API_SECRET_KEY=")) {
      const val = trimmed.substring("INTERNAL_API_SECRET_KEY=".length).replace(/^["']|["']$/g, "").trim();
      process.env.INTERNAL_API_SECRET_KEY = val;
    }
  }
} catch {}

import { createSignedSessionToken } from "../../apps/web/lib/auth/jwt-session";

async function verifyLiveServer() {
  console.log("=== LIVE SERVER VERIFICATION (http://localhost:3000) ===");
  console.log("Using internal secret:", process.env.INTERNAL_API_SECRET_KEY?.slice(0, 10) + "...");

  const userToken = createSignedSessionToken("user_live_01", "creator@shortforge.ai", "USER", 86400000);
  const adminToken = createSignedSessionToken("admin_live_01", "gokul32499@gmail.com", "ADMIN", 86400000);

  // 1. Basic user attempting internal route /factory/workflows
  const r1 = await fetch("http://localhost:3000/factory/workflows", {
    headers: { Cookie: "__session=" + userToken },
    redirect: "manual",
  });
  console.log("1. Basic user -> /factory/workflows: status =", r1.status, "location =", r1.headers.get("location"));

  // 2. Admin user accessing /factory/workflows
  const r2 = await fetch("http://localhost:3000/factory/workflows", {
    headers: { Cookie: "__session=" + adminToken },
    redirect: "manual",
  });
  console.log("2. Admin user -> /factory/workflows: status =", r2.status);

  // 3. Basic user accessing creator surface /factory/templates
  const r3 = await fetch("http://localhost:3000/factory/templates", {
    headers: { Cookie: "__session=" + userToken },
    redirect: "manual",
  });
  console.log("3. Basic user -> /factory/templates: status =", r3.status);

  // 4. Basic user accessing creator surface /factory/jobs
  const r4 = await fetch("http://localhost:3000/factory/jobs", {
    headers: { Cookie: "__session=" + userToken },
    redirect: "manual",
  });
  console.log("4. Basic user -> /factory/jobs: status =", r4.status);

  // 5. Basic user accessing internal API /api/models (Expected: 403 Forbidden)
  const r5 = await fetch("http://localhost:3000/api/models", {
    headers: { Cookie: "__session=" + userToken },
  });
  console.log("5. Basic user -> /api/models: status =", r5.status, "(expected: 403)");

  // 6. Admin user accessing internal API /api/models (Expected: 200 OK)
  const r6 = await fetch("http://localhost:3000/api/models", {
    headers: { Cookie: "__session=" + adminToken },
  });
  console.log("6. Admin user -> /api/models: status =", r6.status, "(expected: 200)");

  // 7. Basic user accessing internal API /api/providers (Expected: 403 Forbidden)
  const r7 = await fetch("http://localhost:3000/api/providers", {
    headers: { Cookie: "__session=" + userToken },
  });
  console.log("7. Basic user -> /api/providers: status =", r7.status, "(expected: 403)");

  // 8. Admin user accessing internal API /api/providers (Expected: 200 OK)
  const r8 = await fetch("http://localhost:3000/api/providers", {
    headers: { Cookie: "__session=" + adminToken },
  });
  console.log("8. Admin user -> /api/providers: status =", r8.status, "(expected: 200)");

  // 9. Basic user accessing internal API /api/settings/api (Expected: 403 Forbidden)
  const r9 = await fetch("http://localhost:3000/api/settings/api", {
    headers: { Cookie: "__session=" + userToken },
  });
  console.log("9. Basic user -> /api/settings/api: status =", r9.status, "(expected: 403)");

  // 10. Admin user accessing internal API /api/settings/api (Expected: 200 OK)
  const r10 = await fetch("http://localhost:3000/api/settings/api", {
    headers: { Cookie: "__session=" + adminToken },
  });
  console.log("10. Admin user -> /api/settings/api: status =", r10.status, "(expected: 200)");

  // 11. Basic user accessing /api/factory-state
  const r11 = await fetch("http://localhost:3000/api/factory-state", {
    headers: { Cookie: "__session=" + userToken },
  });
  const data11 = await r11.json();
  console.log("11. Basic user -> /api/factory-state: status =", r11.status, "surface =", data11.surface, "hasProviders =", !!data11.activeProviders, "hasQueues =", !!data11.queues);

  // 12. Admin user accessing /api/factory-state
  const r12 = await fetch("http://localhost:3000/api/factory-state", {
    headers: { Cookie: "__session=" + adminToken },
  });
  const data12 = await r12.json();
  console.log("12. Admin user -> /api/factory-state: status =", r12.status, "surface =", data12.surface, "hasProviders =", !!data12.activeProviders, "hasQueues =", !!data12.queues);

  console.log("\n=== LIVE BOUNDARY VERIFICATION COMPLETE ===");
}

verifyLiveServer().catch(console.error);
