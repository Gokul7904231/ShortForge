/**
 * DriveConnectionManager — FactoryOS Canonical Google Drive Connection Resolver
 * 
 * Generalizes Google Drive delivery across per-user OAuth connections while
 * preserving the authoritative Admin personal connection for system operations.
 */

import { db } from "../firebase-admin";

export type DrivePurpose =
  | "USER_JOB"
  | "USER_SCHEDULED_JOB"
  | "ADMIN_OWNED_JOB"
  | "SYSTEM_JOB";

export interface DriveConnectionResolution {
  type: "ADMIN_CONNECTION" | "USER_CONNECTION";
  status: "CONNECTED" | "DRIVE_NOT_CONNECTED" | "REAUTH_REQUIRED" | "ERROR";
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  folderId?: string;
  folderName?: string;
  googleEmail?: string;
  error?: string;
}

export interface UserDrivePublicStatus {
  connected: boolean;
  status: "CONNECTED" | "NOT_CONNECTED" | "REAUTH_REQUIRED" | "ERROR";
  googleEmail?: string;
  selectedFolderId?: string;
  selectedFolderName?: string;
  connectedAt?: string;
  lastValidatedAt?: string;
}

export class DriveConnectionManager {
  /**
   * Resolves the appropriate Google Drive connection for a job.
   * Strictly isolates per-user connections from admin/system fallbacks.
   */
  static async resolveDriveConnection({
    ownerId,
    userRole,
    purpose = "USER_JOB",
  }: {
    ownerId?: string;
    userRole?: string;
    purpose?: DrivePurpose;
  }): Promise<DriveConnectionResolution> {
    const role = (userRole || "USER").toUpperCase();
    const isAdminOrOwner = role === "ADMIN" || role === "OWNER";

    // 1. SYSTEM_JOB or ADMIN_OWNED_JOB uses existing Admin credentials
    if (purpose === "SYSTEM_JOB" || purpose === "ADMIN_OWNED_JOB" || (isAdminOrOwner && !ownerId)) {
      const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
      const refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN;
      const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

      if (clientId && clientSecret && refreshToken) {
        return {
          type: "ADMIN_CONNECTION",
          status: "CONNECTED",
          clientId,
          clientSecret,
          refreshToken,
          folderId: folderId || undefined,
          folderName: "ShortFactory (Admin)",
          googleEmail: process.env.GOOGLE_DRIVE_ACCOUNT_EMAIL,
        };
      }

      return {
        type: "ADMIN_CONNECTION",
        status: "DRIVE_NOT_CONNECTED",
        error: "System Admin Google Drive credentials unconfigured in environment.",
      };
    }

    // 2. USER_JOB or USER_SCHEDULED_JOB resolves ownerId's personal DriveConnection ONLY
    if (!ownerId) {
      return {
        type: "USER_CONNECTION",
        status: "DRIVE_NOT_CONNECTED",
        error: "Missing ownerId for user Drive connection lookup.",
      };
    }

    try {
      const doc = await db.collection("drive_connections").doc(ownerId).get();
      if (!doc.exists) {
        if (((purpose as string) === "ADMIN_OWNED_JOB" || (purpose as string) === "SYSTEM_JOB") && isAdminOrOwner) {
          return this.resolveDriveConnection({ purpose: "ADMIN_OWNED_JOB" });
        }

        return {
          type: "USER_CONNECTION",
          status: "DRIVE_NOT_CONNECTED",
          error: "User has not connected a personal Google Drive account.",
        };
      }

      const data = doc.data() || {};
      const refreshToken = data.refreshToken;
      const clientId = data.clientId || process.env.GOOGLE_DRIVE_CLIENT_ID;
      const clientSecret = data.clientSecret || process.env.GOOGLE_DRIVE_CLIENT_SECRET;

      if (!refreshToken || !clientId || !clientSecret) {
        return {
          type: "USER_CONNECTION",
          status: "REAUTH_REQUIRED",
          error: "User Google Drive connection is missing valid tokens.",
        };
      }

      return {
        type: "USER_CONNECTION",
        status: (data.status as any) || "CONNECTED",
        clientId,
        clientSecret,
        refreshToken,
        folderId: data.selectedFolderId,
        folderName: data.selectedFolderName || "AI Shorts",
        googleEmail: data.googleEmail,
      };
    } catch (err: any) {
      return {
        type: "USER_CONNECTION",
        status: "ERROR",
        error: err.message || "Failed to resolve user Google Drive connection.",
      };
    }
  }

  /**
   * Retrieves sanitized public status of a user's Drive connection (no tokens exposed).
   */
  static async getUserDriveStatus(userId: string, role: string = "USER"): Promise<UserDrivePublicStatus> {
    const isOwnerOrAdmin = role === "ADMIN" || role === "OWNER";
    
    try {
      const doc = await db.collection("drive_connections").doc(userId).get();
      if (doc.exists) {
        const data = doc.data() || {};
        return {
          connected: data.status === "CONNECTED",
          status: data.status || "NOT_CONNECTED",
          googleEmail: data.googleEmail,
          selectedFolderId: data.selectedFolderId,
          selectedFolderName: data.selectedFolderName || "AI Shorts",
          connectedAt: data.connectedAt,
          lastValidatedAt: data.lastValidatedAt,
        };
      }

      if (isOwnerOrAdmin && process.env.GOOGLE_DRIVE_REFRESH_TOKEN) {
        return {
          connected: true,
          status: "CONNECTED",
          googleEmail: process.env.GOOGLE_DRIVE_ACCOUNT_EMAIL,
          selectedFolderName: "ShortFactory (Admin Default)",
        };
      }

      return {
        connected: false,
        status: "NOT_CONNECTED",
      };
    } catch {
      return {
        connected: false,
        status: "NOT_CONNECTED",
      };
    }
  }

  /**
   * Saves or updates a user's Google Drive OAuth connection.
   */
  static async saveUserDriveConnection(
    userId: string,
    data: {
      refreshToken: string;
      googleEmail?: string;
      selectedFolderId?: string;
      selectedFolderName?: string;
      clientId?: string;
      clientSecret?: string;
    }
  ): Promise<void> {
    const ref = db.collection("drive_connections").doc(userId);
    await ref.set(
      {
        userId,
        refreshToken: data.refreshToken,
        googleEmail: data.googleEmail || "",
        selectedFolderId: data.selectedFolderId || "",
        selectedFolderName: data.selectedFolderName || "AI Shorts",
        clientId: data.clientId || "",
        clientSecret: data.clientSecret || "",
        status: "CONNECTED",
        connectedAt: new Date().toISOString(),
        lastValidatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  }

  /**
   * Disconnects a user's Google Drive account.
   */
  static async disconnectUserDrive(userId: string): Promise<void> {
    const ref = db.collection("drive_connections").doc(userId);
    await ref.delete();
  }
}
