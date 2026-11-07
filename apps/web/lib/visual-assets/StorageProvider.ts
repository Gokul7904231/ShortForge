import fs from "fs";
import path from "path";

export interface StorageProvider {
  upload(key: string, data: Buffer, contentType: string): Promise<string>;
  download(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
}

function cleanKey(key: string): string {
  // Strips local://, b2mock://, or b2://bucket/ prefixes
  return key.replace(/^(local:\/\/|b2mock:\/\/|b2:\/\/[^\/]+\/)/, "");
}

export class LocalStorageProvider implements StorageProvider {
  private baseDir = path.resolve(process.cwd(), "data", "visual-assets-store", "local");

  constructor() {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  private getPath(key: string): string {
    const cleaned = cleanKey(key);
    return path.join(this.baseDir, cleaned.replace(/\//g, path.sep));
  }

  async upload(key: string, data: Buffer, contentType: string): Promise<string> {
    const cleaned = cleanKey(key);
    const filePath = this.getPath(cleaned);
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, data);
    return `local://${cleaned}`;
  }

  async download(key: string): Promise<Buffer> {
    const filePath = this.getPath(key);
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${key}`);
    }
    return fs.readFileSync(filePath);
  }

  async exists(key: string): Promise<boolean> {
    return fs.existsSync(this.getPath(key));
  }

  async delete(key: string): Promise<void> {
    const filePath = this.getPath(key);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}

export class BackblazeB2StorageProvider implements StorageProvider {
  private baseDir = path.resolve(process.cwd(), "data", "visual-assets-store", "b2");
  private keyId: string;
  private applicationKey: string;
  private bucketName: string;
  private isMocked = false;

  constructor() {
    this.keyId = process.env.B2_APPLICATION_KEY_ID || "";
    this.applicationKey = process.env.B2_APPLICATION_KEY || "";
    this.bucketName = process.env.B2_BUCKET_NAME || "";

    if (!this.keyId || !this.applicationKey || !this.bucketName) {
      if (process.env.VISUAL_STORAGE_PROVIDER === "b2") {
        throw new Error(
          "Backblaze B2 credentials (B2_APPLICATION_KEY_ID, B2_APPLICATION_KEY, B2_BUCKET_NAME) are missing but VISUAL_STORAGE_PROVIDER is set to 'b2'."
        );
      }
      this.isMocked = true;
      if (!fs.existsSync(this.baseDir)) {
        fs.mkdirSync(this.baseDir, { recursive: true });
      }
    }
  }

  private getPath(key: string): string {
    const cleaned = cleanKey(key);
    return path.join(this.baseDir, cleaned.replace(/\//g, path.sep));
  }

  async upload(key: string, data: Buffer, contentType: string): Promise<string> {
    const cleaned = cleanKey(key);
    if (this.isMocked) {
      const filePath = this.getPath(cleaned);
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(filePath, data);
      return `b2mock://${cleaned}`;
    }

    try {
      const auth = Buffer.from(`${this.keyId}:${this.applicationKey}`).toString("base64");
      const authRes = await fetch("https://api.backblazeb2.com/b2api/v2/b2_authorize_account", {
        headers: { Authorization: `Basic ${auth}` },
      });
      if (!authRes.ok) throw new Error(`B2 Authorization failed: ${authRes.statusText}`);
      const authData = await authRes.json();
      const apiUrl = authData.apiUrl;
      const authorizationToken = authData.authorizationToken;

      let bucketId = authData.allowed?.bucketId;
      if (!bucketId) {
        const bucketsRes = await fetch(`${apiUrl}/b2api/v2/b2_list_buckets`, {
          method: "POST",
          headers: { Authorization: authorizationToken },
          body: JSON.stringify({ accountId: authData.accountId }),
        });
        const bucketsData = await bucketsRes.json();
        const bucket = bucketsData.buckets?.find((b: any) => b.bucketName === this.bucketName);
        if (!bucket) throw new Error(`Bucket not found: ${this.bucketName}`);
        bucketId = bucket.bucketId;
      }

      const uploadUrlRes = await fetch(`${apiUrl}/b2api/v2/b2_get_upload_url`, {
        method: "POST",
        headers: { Authorization: authorizationToken },
        body: JSON.stringify({ bucketId }),
      });
      const uploadUrlData = await uploadUrlRes.json();
      const uploadUrl = uploadUrlData.uploadUrl;
      const uploadAuthToken = uploadUrlData.authorizationToken;

      const crypto = require("crypto");
      const sha1 = crypto.createHash("sha1").update(data).digest("hex");

      const uploadRes = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          Authorization: uploadAuthToken,
          "X-Bz-File-Name": encodeURIComponent(cleaned),
          "Content-Type": contentType,
          "Content-Length": String(data.length),
          "X-Bz-Content-Sha1": sha1,
        },
        body: new Blob([new Uint8Array(data)]),
      });

      if (!uploadRes.ok) {
        throw new Error(`B2 Upload failed: ${await uploadRes.text()}`);
      }

      return `b2://${this.bucketName}/${cleaned}`;
    } catch (err: any) {
      console.error("[B2StorageProvider] Upload failed:", err.message);
      throw err;
    }
  }

  async download(key: string): Promise<Buffer> {
    const cleaned = cleanKey(key);
    if (this.isMocked) {
      const filePath = this.getPath(cleaned);
      if (!fs.existsSync(filePath)) {
        throw new Error(`B2 mock file not found: ${cleaned}`);
      }
      return fs.readFileSync(filePath);
    }

    try {
      const auth = Buffer.from(`${this.keyId}:${this.applicationKey}`).toString("base64");
      const authRes = await fetch("https://api.backblazeb2.com/b2api/v2/b2_authorize_account", {
        headers: { Authorization: `Basic ${auth}` },
      });
      const authData = await authRes.json();
      const downloadUrl = authData.downloadUrl;
      const authorizationToken = authData.authorizationToken;

      const fileRes = await fetch(`${downloadUrl}/file/${this.bucketName}/${cleaned}`, {
        headers: { Authorization: authorizationToken },
      });
      if (!fileRes.ok) throw new Error(`B2 file download failed: ${fileRes.statusText}`);
      
      const arrayBuffer = await fileRes.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (err: any) {
      console.error("[B2StorageProvider] Download failed:", err.message);
      throw err;
    }
  }

  async exists(key: string): Promise<boolean> {
    const cleaned = cleanKey(key);
    if (this.isMocked) {
      return fs.existsSync(this.getPath(cleaned));
    }

    try {
      const auth = Buffer.from(`${this.keyId}:${this.applicationKey}`).toString("base64");
      const authRes = await fetch("https://api.backblazeb2.com/b2api/v2/b2_authorize_account", {
        headers: { Authorization: `Basic ${auth}` },
      });
      const authData = await authRes.json();
      const downloadUrl = authData.downloadUrl;
      const authorizationToken = authData.authorizationToken;

      const res = await fetch(`${downloadUrl}/file/${this.bucketName}/${cleaned}`, {
        method: "HEAD",
        headers: { Authorization: authorizationToken },
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    const cleaned = cleanKey(key);
    if (this.isMocked) {
      const filePath = this.getPath(cleaned);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      return;
    }

    try {
      const auth = Buffer.from(`${this.keyId}:${this.applicationKey}`).toString("base64");
      const authRes = await fetch("https://api.backblazeb2.com/b2api/v2/b2_authorize_account", {
        headers: { Authorization: `Basic ${auth}` },
      });
      const authData = await authRes.json();
      const apiUrl = authData.apiUrl;
      const authorizationToken = authData.authorizationToken;

      let bucketId = authData.allowed?.bucketId;
      if (!bucketId) {
        const bucketsRes = await fetch(`${apiUrl}/b2api/v2/b2_list_buckets`, {
          method: "POST",
          headers: { Authorization: authorizationToken },
          body: JSON.stringify({ accountId: authData.accountId }),
        });
        const bucketsData = await bucketsRes.json();
        const bucket = bucketsData.buckets?.find((b: any) => b.bucketName === this.bucketName);
        if (!bucket) return;
        bucketId = bucket.bucketId;
      }

      const listRes = await fetch(`${apiUrl}/b2api/v2/b2_list_file_names`, {
        method: "POST",
        headers: { Authorization: authorizationToken },
        body: JSON.stringify({
          bucketId,
          prefix: cleaned,
          maxFileCount: 1,
        }),
      });
      const listData = await listRes.json();
      const file = listData.files?.find((f: any) => f.fileName === cleaned);
      if (!file) return;

      await fetch(`${apiUrl}/b2api/v2/b2_delete_file_version`, {
        method: "POST",
        headers: { Authorization: authorizationToken },
        body: JSON.stringify({
          fileName: cleaned,
          fileId: file.fileId,
        }),
      });
    } catch (err: any) {
      console.error("[B2StorageProvider] Delete failed:", err.message);
    }
  }
}

export function getStorageProvider(): StorageProvider {
  const provider = process.env.VISUAL_STORAGE_PROVIDER || "local";
  if (provider === "b2") {
    return new BackblazeB2StorageProvider();
  }
  return new LocalStorageProvider();
}
