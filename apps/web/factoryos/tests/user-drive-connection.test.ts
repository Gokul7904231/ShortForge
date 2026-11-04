/**
 * FactoryOS Google Drive Connection Resolution & Isolation Tests
 */

import { describe, it, expect, beforeEach } from "vitest";
import { DriveConnectionManager } from "../../lib/drive/DriveConnectionManager";
import { db } from "../../lib/firebase-admin";

describe("Google Drive Per-User Connection & Admin Fallback", () => {
  const userAUid = `user_a_${Date.now()}`;
  const userBUid = `user_b_${Date.now()}`;

  beforeEach(async () => {
    // Clean up
    try {
      await db.collection("drive_connections").doc(userAUid).delete();
      await db.collection("drive_connections").doc(userBUid).delete();
    } catch {}
  });

  it("01: Unconnected user returns DRIVE_NOT_CONNECTED without falling back to Admin Drive", async () => {
    const res = await DriveConnectionManager.resolveDriveConnection({
      ownerId: userAUid,
      userRole: "USER",
      purpose: "USER_JOB",
    });

    expect(res.status).toBe("DRIVE_NOT_CONNECTED");
    expect(res.type).toBe("USER_CONNECTION");
    expect(res.refreshToken).toBeUndefined();
  });

  it("02: Connected user resolves personal OAuth credentials and selected folder", async () => {
    await DriveConnectionManager.saveUserDriveConnection(userAUid, {
      refreshToken: "test_refresh_token_user_a",
      googleEmail: "creator_a@gmail.com",
      selectedFolderId: "folder_12345",
      selectedFolderName: "My Creator Shorts",
      clientId: "test_client_id",
      clientSecret: "test_client_secret",
    });

    const res = await DriveConnectionManager.resolveDriveConnection({
      ownerId: userAUid,
      userRole: "PRO",
      purpose: "USER_JOB",
    });

    expect(res.status).toBe("CONNECTED");
    expect(res.type).toBe("USER_CONNECTION");
    expect(res.refreshToken).toBe("test_refresh_token_user_a");
    expect(res.folderId).toBe("folder_12345");
    expect(res.googleEmail).toBe("creator_a@gmail.com");
  });

  it("03: Multi-user isolation: User B cannot resolve User A's credentials", async () => {
    await DriveConnectionManager.saveUserDriveConnection(userAUid, {
      refreshToken: "secret_token_user_a",
      googleEmail: "user_a@gmail.com",
    });

    const resB = await DriveConnectionManager.resolveDriveConnection({
      ownerId: userBUid,
      userRole: "USER",
      purpose: "USER_JOB",
    });

    expect(resB.status).toBe("DRIVE_NOT_CONNECTED");
    expect(resB.refreshToken).toBeUndefined();
  });

  it("04: System and Admin jobs preserve system environment credentials", async () => {
    process.env.GOOGLE_DRIVE_CLIENT_ID = "env_client_id";
    process.env.GOOGLE_DRIVE_CLIENT_SECRET = "env_client_secret";
    process.env.GOOGLE_DRIVE_REFRESH_TOKEN = "env_refresh_token";
    // The account email is configuration, never a hardcoded identity.
    process.env.GOOGLE_DRIVE_ACCOUNT_EMAIL = "ops@shortforge.test";

    const res = await DriveConnectionManager.resolveDriveConnection({
      purpose: "SYSTEM_JOB",
    });

    expect(res.type).toBe("ADMIN_CONNECTION");
    expect(res.status).toBe("CONNECTED");
    expect(res.refreshToken).toBe("env_refresh_token");
    expect(res.googleEmail).toBe("ops@shortforge.test");
  });
});
