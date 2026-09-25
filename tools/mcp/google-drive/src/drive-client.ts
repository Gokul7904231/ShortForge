import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { google, drive_v3 } from "googleapis";
import { assertAllowedDownloadPath, assertAllowedUploadPath } from "./security.js";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
const DRIVE_READONLY_SCOPE = "https://www.googleapis.com/auth/drive.readonly";

export type DriveScopeMode = "readonly" | "readwrite";

export interface DriveFileSummary {
  id: string;
  name: string;
  mimeType?: string;
  sizeBytes?: number;
  createdTime?: string;
  modifiedTime?: string;
  parents?: string[];
  webViewLink?: string;
}

function escapeDriveLiteral(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function sha256File(filePath: string): Promise<string> {
  return await new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

export class GoogleDriveClient {
  private readonly drive: drive_v3.Drive;
  private readonly scopeMode: DriveScopeMode;
  private readonly rootFolderId?: string;

  constructor() {
    this.scopeMode = (process.env.GOOGLE_DRIVE_MCP_SCOPE_MODE || "readonly") as DriveScopeMode;
    if (this.scopeMode !== "readonly" && this.scopeMode !== "readwrite") {
      throw new Error("GOOGLE_DRIVE_MCP_SCOPE_MODE must be readonly or readwrite.");
    }

    this.rootFolderId = process.env.GOOGLE_DRIVE_MCP_ROOT_FOLDER_ID || process.env.GOOGLE_DRIVE_FOLDER_ID || undefined;
    const auth = this.buildAuth();
    this.drive = google.drive({ version: "v3", auth });
  }

  private buildAuth() {
    const scopes = [this.scopeMode === "readwrite" ? DRIVE_SCOPE : DRIVE_READONLY_SCOPE];
    const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

    if (credentialsPath) {
      const resolved = path.resolve(process.cwd(), credentialsPath);
      if (!fs.existsSync(resolved)) {
        throw new Error(`GOOGLE_APPLICATION_CREDENTIALS does not exist: ${resolved}`);
      }
      return new google.auth.GoogleAuth({ keyFile: resolved, scopes });
    }

    const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
    const refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN;

    if (!clientId || !clientSecret || !refreshToken) {
      throw new Error(
        "Configure GOOGLE_APPLICATION_CREDENTIALS or " +
        "GOOGLE_DRIVE_CLIENT_ID + GOOGLE_DRIVE_CLIENT_SECRET + GOOGLE_DRIVE_REFRESH_TOKEN."
      );
    }

    const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
    oauth2.setCredentials({ refresh_token: refreshToken });
    return oauth2;
  }

  private assertWriteScope(): void {
    if (this.scopeMode !== "readwrite") {
      throw new Error(
        "This MCP is in readonly mode. Set GOOGLE_DRIVE_MCP_SCOPE_MODE=readwrite for folder creation/uploads."
      );
    }
  }

  private scopedParentQuery(folderId?: string): string {
    const parent = folderId || this.rootFolderId;
    return parent ? `'${escapeDriveLiteral(parent)}' in parents` : "'root' in parents";
  }

  private toSummary(file: drive_v3.Schema$File): DriveFileSummary {
    return {
      id: file.id || "",
      name: file.name || "",
      mimeType: file.mimeType || undefined,
      sizeBytes: file.size ? Number(file.size) : undefined,
      createdTime: file.createdTime || undefined,
      modifiedTime: file.modifiedTime || undefined,
      parents: file.parents || undefined,
      webViewLink: file.webViewLink || undefined,
    };
  }

  async list(params: { folderId?: string; pageSize?: number; pageToken?: string; query?: string }) {
    const clauses = [this.scopedParentQuery(params.folderId), "trashed = false"];
    if (params.query) {
      const literal = escapeDriveLiteral(params.query);
      clauses.push(`name contains '${literal}'`);
    }

    const res = await this.drive.files.list({
      q: clauses.join(" and "),
      pageSize: Math.min(Math.max(params.pageSize || 50, 1), 1000),
      pageToken: params.pageToken,
      orderBy: "modifiedTime desc",
      fields: "nextPageToken, files(id,name,mimeType,size,createdTime,modifiedTime,parents,webViewLink)",
      spaces: "drive",
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
    });

    return {
      files: (res.data.files || []).map((file) => this.toSummary(file)),
      nextPageToken: res.data.nextPageToken || undefined,
    };
  }

  async search(params: { query: string; pageSize?: number; pageToken?: string }) {
    const literal = escapeDriveLiteral(params.query);
    const res = await this.drive.files.list({
      q: `name contains '${literal}' and trashed = false`,
      pageSize: Math.min(Math.max(params.pageSize || 50, 1), 1000),
      pageToken: params.pageToken,
      orderBy: "modifiedTime desc",
      fields: "nextPageToken, files(id,name,mimeType,size,createdTime,modifiedTime,parents,webViewLink)",
      spaces: "drive",
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
    });

    return {
      files: (res.data.files || []).map((file) => this.toSummary(file)),
      nextPageToken: res.data.nextPageToken || undefined,
    };
  }

  async metadata(fileId: string) {
    const res = await this.drive.files.get({
      fileId,
      fields: "id,name,mimeType,size,createdTime,modifiedTime,parents,webViewLink,description,md5Checksum,capabilities",
      supportsAllDrives: true,
    });
    return res.data;
  }

  async createFolder(name: string, parentId?: string) {
    this.assertWriteScope();
    const parent = parentId || this.rootFolderId;
    const res = await this.drive.files.create({
      requestBody: {
        name,
        mimeType: "application/vnd.google-apps.folder",
        ...(parent ? { parents: [parent] } : {}),
      },
      fields: "id,name,mimeType,parents,createdTime,webViewLink",
      supportsAllDrives: true,
    });
    return res.data;
  }

  async upload(params: { sourcePath: string; folderId?: string; fileName?: string; mimeType?: string; description?: string }) {
    this.assertWriteScope();
    const source = assertAllowedUploadPath(params.sourcePath);
    const parent = params.folderId || this.rootFolderId;
    const fileName = params.fileName || path.basename(source);
    const sourceSha256 = await sha256File(source);
    const stream = fs.createReadStream(source);

    const createRequest: drive_v3.Params$Resource$Files$Create = {
      requestBody: {
        name: fileName,
        ...(params.description ? { description: params.description } : {}),
        ...(parent ? { parents: [parent] } : {}),
      },
      media: {
        mimeType: params.mimeType || "application/octet-stream",
        body: stream,
      },
      fields: "id,name,mimeType,size,createdTime,modifiedTime,parents,webViewLink",
      supportsAllDrives: true,
    };

    const res = await this.drive.files.create(createRequest);

    return {
      file: this.toSummary(res.data),
      sourcePath: source,
      sourceSha256,
    };
  }

  async download(fileId: string, destinationPath?: string) {
    const safePath = assertAllowedDownloadPath(destinationPath);
    const meta = await this.metadata(fileId);

    const response = await this.drive.files.get(
      { fileId, alt: "media", supportsAllDrives: true },
      { responseType: "stream" }
    ) as { data: NodeJS.ReadableStream };

    await new Promise<void>((resolve, reject) => {
      const output = fs.createWriteStream(safePath);
      response.data.pipe(output);
      response.data.on("error", reject);
      output.on("finish", resolve);
      output.on("error", reject);
    });

    return {
      file: this.toSummary(meta),
      destinationPath: safePath,
      sha256: await sha256File(safePath),
    };
  }

  async exportFile(fileId: string, mimeType: string, destinationPath?: string) {
    const safePath = assertAllowedDownloadPath(destinationPath);
    const meta = await this.metadata(fileId);

    const response = await this.drive.files.export(
      { fileId, mimeType },
      { responseType: "stream" }
    ) as { data: NodeJS.ReadableStream };

    await new Promise<void>((resolve, reject) => {
      const output = fs.createWriteStream(safePath);
      response.data.pipe(output);
      response.data.on("error", reject);
      output.on("finish", resolve);
      output.on("error", reject);
    });

    return {
      file: this.toSummary(meta),
      destinationPath: safePath,
      exportMimeType: mimeType,
      sha256: await sha256File(safePath),
    };
  }

  async health() {
    const startedAt = Date.now();
    const about = await this.drive.about.get({
      fields: "user,storageQuota",
    });

    let rootAccessible = true;
    if (this.rootFolderId) {
      try {
        await this.drive.files.get({
          fileId: this.rootFolderId,
          fields: "id,name,mimeType",
          supportsAllDrives: true,
        });
      } catch {
        rootAccessible = false;
      }
    }

    return {
      ok: rootAccessible,
      latencyMs: Date.now() - startedAt,
      scopeMode: this.scopeMode,
      rootFolderId: this.rootFolderId || "root",
      user: about.data.user || null,
      storageQuota: about.data.storageQuota || null,
    };
  }
}
