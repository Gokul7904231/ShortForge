import { afterEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createHash } from "node:crypto";

import { ContentAddressedStore } from "../core/compute/cas/ContentAddressedStore";
import {
  editorSourceStorageKey,
  hydrateEditorSourcePackageBlobs,
  persistEditorSourcePackageBlobs,
} from "../core/editor/EditorSourcePackageStorage";
import type { EditorSourcePackageRecord } from "../core/editor/EditorSourcePackage";

let root = "";

function tempRoot() {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "shortforge-editor-blob-store-"));
  return root;
}

function hash(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

function memoryStorage() {
  const objects = new Map<string, {
    bytes: Buffer;
    contentType: string;
    metadata: Record<string, string>;
  }>();

  const storage = {
    file(key: string) {
      return {
        exists: async (): Promise<[boolean]> => [objects.has(key)],
        getMetadata: async (): Promise<[Record<string, any>]> => {
          const value = objects.get(key);
          if (!value) throw new Error("object missing");
          return [{
            size: String(value.bytes.length),
            contentType: value.contentType,
            metadata: { ...value.metadata },
          }];
        },
        save: async (bytes: Buffer, options?: Record<string, any>) => {
          const metadata = options?.metadata || {};
          objects.set(key, {
            bytes: Buffer.from(bytes),
            contentType: String(metadata.contentType || "application/octet-stream"),
            metadata: { ...(metadata.metadata || {}) },
          });
        },
        download: async (): Promise<[Buffer]> => {
          const value = objects.get(key);
          if (!value) throw new Error("object missing");
          return [Buffer.from(value.bytes)];
        },
      };
    },
  };
  return { storage, objects };
}

afterEach(() => {
  if (root && fs.existsSync(root)) fs.rmSync(root, { recursive: true, force: true });
  root = "";
});

describe("EditorSourcePackageStorage", () => {
  it("persists owner/job-scoped bytes and rehydrates CAS in a cold instance", async () => {
    const base = tempRoot();
    const casA = new ContentAddressedStore(path.join(base, "cas-a"));
    const imagePath = path.join(base, "image.png");
    const compositionPath = path.join(base, "composition.json");
    const imageBytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    );
    const compositionBytes = Buffer.from('{"schemaVersion":"2.0.0","compositionId":"cold-open-test"}', "utf8");
    fs.writeFileSync(imagePath, imageBytes);
    fs.writeFileSync(compositionPath, compositionBytes);

    const ownerId = "user-editor-storage-test";
    const jobId = "job-editor-storage-test";
    const image = await casA.putFile(imagePath, "editor_source_asset", "image/png", {
      sourceJobId: jobId,
      importedBy: ownerId,
    });
    const { storage, objects } = memoryStorage();
    const durable = await persistEditorSourcePackageBlobs({
      ownerId,
      jobId,
      compositionPath,
      compositionSha256: hash(compositionBytes),
      compositionByteLength: compositionBytes.length,
      sourceAssets: [{
        assetId: image.sha256,
        originalAssetId: "scene-source",
        sha256: image.sha256,
        artifactId: image.artifactId,
        byteLength: image.byteLength,
        mimeType: "image/png",
        roles: ["VISUAL"],
        sceneId: "scene-1",
      }],
      cas: casA,
      storage,
    });

    expect(durable).not.toBeNull();
    expect(objects.size).toBe(2);
    expect(durable!.compositionStorageKey).toBe(
      editorSourceStorageKey("compositions", ownerId, jobId, hash(compositionBytes), "application/json"),
    );
    expect(durable!.sourceAssetStorageKeys[image.sha256]).toBe(
      editorSourceStorageKey("assets", ownerId, jobId, image.sha256, "image/png"),
    );

    const packageRecord = {
      schemaVersion: "shortforge.editor-source.v1",
      sourceKind: "COMPOSITION_PACKAGE",
      sourceJobId: jobId,
      ownerId,
      compositionId: "cold-open-test",
      compositionArtifactId: "composition-artifact",
      compositionStorageKey: durable!.compositionStorageKey,
      compositionSha256: hash(compositionBytes),
      compositionByteLength: compositionBytes.length,
      compositionHashSha256: hash(compositionBytes),
      sourceAssetSha256s: [image.sha256],
      sourceAssets: [{
        assetId: image.sha256,
        originalAssetId: "scene-source",
        sha256: image.sha256,
        artifactId: image.artifactId,
        byteLength: image.byteLength,
        mimeType: "image/png",
        roles: ["VISUAL"],
        sceneId: "scene-1",
        storageKey: durable!.sourceAssetStorageKeys[image.sha256],
      }],
      warnings: [],
      renderIntentId: "intent-cold-open-test",
      timelineFingerprint: "a".repeat(64),
      createdAt: new Date().toISOString(),
    } as EditorSourcePackageRecord;

    const casB = new ContentAddressedStore(path.join(base, "cas-b"));
    await hydrateEditorSourcePackageBlobs({
      packageRecord,
      ownerId,
      jobId,
      cas: casB,
      storage,
    });

    const restoredImage = casB.getByHash(image.sha256);
    const restoredComposition = casB.getByHash(packageRecord.compositionSha256);
    expect(restoredImage?.mimeType).toBe("image/png");
    expect(restoredImage?.byteLength).toBe(imageBytes.length);
    expect(await ContentAddressedStore.computeFileSha256(restoredImage!.uri)).toBe(image.sha256);
    expect(fs.readFileSync(restoredComposition!.uri).equals(compositionBytes)).toBe(true);
  });

  it("rejects a durable object whose bytes no longer match its declared digest", async () => {
    const base = tempRoot();
    const casA = new ContentAddressedStore(path.join(base, "cas-a"));
    const imagePath = path.join(base, "image.png");
    const compositionPath = path.join(base, "composition.json");
    const imageBytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    );
    const compositionBytes = Buffer.from('{"compositionId":"tamper-test"}', "utf8");
    fs.writeFileSync(imagePath, imageBytes);
    fs.writeFileSync(compositionPath, compositionBytes);
    const ownerId = "user-tamper-test";
    const jobId = "job-tamper-test";
    const image = await casA.putFile(imagePath, "editor_source_asset", "image/png");
    const { storage, objects } = memoryStorage();
    const durable = await persistEditorSourcePackageBlobs({
      ownerId,
      jobId,
      compositionPath,
      compositionSha256: hash(compositionBytes),
      compositionByteLength: compositionBytes.length,
      sourceAssets: [{
        assetId: image.sha256,
        originalAssetId: "source",
        sha256: image.sha256,
        artifactId: image.artifactId,
        byteLength: image.byteLength,
        mimeType: "image/png",
        roles: ["VISUAL"],
      }],
      cas: casA,
      storage,
    });

    const key = durable!.sourceAssetStorageKeys[image.sha256];
    const saved = objects.get(key)!;
    saved.bytes = Buffer.from(saved.bytes);
    saved.bytes[0] = saved.bytes[0]! ^ 0xff;
    objects.set(key, saved);

    const packageRecord = {
      schemaVersion: "shortforge.editor-source.v1",
      sourceKind: "COMPOSITION_PACKAGE",
      sourceJobId: jobId,
      ownerId,
      compositionId: "tamper-test",
      compositionArtifactId: "composition-artifact",
      compositionStorageKey: durable!.compositionStorageKey,
      compositionSha256: hash(compositionBytes),
      compositionByteLength: compositionBytes.length,
      compositionHashSha256: hash(compositionBytes),
      sourceAssetSha256s: [image.sha256],
      sourceAssets: [{
        assetId: image.sha256,
        originalAssetId: "source",
        sha256: image.sha256,
        artifactId: image.artifactId,
        byteLength: image.byteLength,
        mimeType: "image/png",
        roles: ["VISUAL"],
        storageKey: key,
      }],
      renderIntentId: "intent-tamper-test",
      timelineFingerprint: "b".repeat(64),
      createdAt: new Date().toISOString(),
    } as EditorSourcePackageRecord;

    const casB = new ContentAddressedStore(path.join(base, "cas-b"));
    await expect(hydrateEditorSourcePackageBlobs({
      packageRecord,
      ownerId,
      jobId,
      cas: casB,
      storage,
    })).rejects.toThrow("EDITOR_SOURCE_DURABLE_DIGEST_MISMATCH");
    expect(casB.getByHash(image.sha256)).toBeUndefined();
  });

  it("rejects owner or job identity that differs from the persisted package", async () => {
    const cas = new ContentAddressedStore(path.join(tempRoot(), "cas"));
    const record = {
      schemaVersion: "shortforge.editor-source.v1",
      sourceKind: "COMPOSITION_PACKAGE",
      sourceJobId: "actual-job",
      ownerId: "actual-owner",
      compositionId: "composition",
      compositionArtifactId: "artifact",
      compositionSha256: "a".repeat(64),
      compositionByteLength: 10,
      compositionHashSha256: "a".repeat(64),
      sourceAssetSha256s: [],
      sourceAssets: [],
      renderIntentId: "intent",
      timelineFingerprint: "b".repeat(64),
      createdAt: new Date().toISOString(),
    } as EditorSourcePackageRecord;
    await expect(hydrateEditorSourcePackageBlobs({
      packageRecord: record,
      ownerId: "attacker",
      jobId: "actual-job",
      cas,
      storage: memoryStorage().storage,
    })).rejects.toThrow("EDITOR_SOURCE_DURABLE_PACKAGE_BINDING_MISMATCH");
  });
});
