/**
 * Durable byte backing for owner-bound ShortForge Editor source packages.
 *
 * CAS is still the address/verification authority. This adapter stores the
 * immutable bytes in the application's configured Firebase Storage bucket so a
 * different web process can rehydrate CAS after a cold start. Object names are
 * scoped by hashed owner/job identity and content digest; raw IDs are never used
 * as storage path components.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createHash } from "node:crypto";

import { bucket } from "../../../lib/firebase-admin";
import { ContentAddressedStore } from "../compute/cas/ContentAddressedStore";
import type { EditorSourcePackageAsset, EditorSourcePackageRecord } from "./EditorSourcePackage";

interface EditorBlobFile {
  exists?: () => Promise<[boolean]>;
  getMetadata?: () => Promise<[Record<string, any>]>;
  save?: (data: Buffer, options?: Record<string, unknown>) => Promise<unknown>;
  download?: () => Promise<[Buffer]>;
}

interface EditorBlobStorage {
  file: (key: string) => EditorBlobFile;
}

export interface PersistedEditorSourceBlobs {
  readonly compositionStorageKey: string;
  readonly sourceAssetStorageKeys: Readonly<Record<string, string>>;
}

const MAX_EDITOR_SOURCE_BLOB_BYTES = 250 * 1024 * 1024;

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function ownerJobDigests(ownerId: string, jobId: string) {
  return {
    ownerDigest: sha256("shortforge-editor-owner-v1\0" + ownerId),
    jobDigest: sha256("shortforge-editor-job-v1\0" + jobId),
  };
}

function extensionForMime(mimeType: string): string {
  const normalized = mimeType.toLowerCase().split(";", 1)[0]?.trim();
  const extensions: Record<string, string> = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "image/avif": ".avif",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "video/quicktime": ".mov",
    "audio/wav": ".wav",
    "audio/mpeg": ".mp3",
    "audio/mp4": ".m4a",
    "audio/aac": ".aac",
    "audio/ogg": ".ogg",
    "audio/opus": ".opus",
    "audio/flac": ".flac",
    "application/json": ".json",
  };
  const extension = normalized ? extensions[normalized] : undefined;
  if (!extension) throw new Error("EDITOR_SOURCE_DURABLE_MIME_UNSUPPORTED");
  return extension;
}

export function editorSourceStorageKey(
  kind: "assets" | "compositions",
  ownerId: string,
  jobId: string,
  digest: string,
  mimeType: string,
): string {
  if (!ownerId || ownerId === "anonymous" || !jobId || !/^[a-f0-9]{64}$/i.test(digest)) {
    throw new Error("EDITOR_SOURCE_DURABLE_IDENTITY_INVALID");
  }
  const { ownerDigest, jobDigest } = ownerJobDigests(ownerId, jobId);
  return [
    "shortforge-editor",
    "v1",
    ownerDigest,
    jobDigest,
    kind,
    digest.toLowerCase() + extensionForMime(mimeType),
  ].join("/");
}

function requireBlobStorage(storage: EditorBlobStorage | undefined): EditorBlobStorage | null {
  const candidate = storage || bucket as EditorBlobStorage;
  try {
    const file = candidate.file("shortforge-editor/v1/health-check");
    if (
      typeof file.save === "function" &&
      typeof file.getMetadata === "function" &&
      typeof file.download === "function"
    ) return candidate;
  } catch {
    // The firebase-admin fallback object intentionally lacks durable byte APIs.
  }
  return null;
}

function expectedMetadata(input: {
  ownerId: string;
  jobId: string;
  sha256: string;
  byteLength: number;
  mimeType: string;
  kind: "ASSET" | "COMPOSITION";
}) {
  const { ownerDigest, jobDigest } = ownerJobDigests(input.ownerId, input.jobId);
  return {
    sha256: input.sha256.toLowerCase(),
    byteLength: String(input.byteLength),
    mimeType: input.mimeType,
    ownerDigest,
    jobDigest,
    kind: input.kind,
  };
}

function metadataMatches(
  actual: Record<string, any>,
  expected: ReturnType<typeof expectedMetadata>,
): boolean {
  const custom = actual.metadata && typeof actual.metadata === "object" ? actual.metadata : {};
  return String(actual.size) === expected.byteLength &&
    String(actual.contentType || "").toLowerCase() === expected.mimeType.toLowerCase() &&
    String(custom.sha256 || "").toLowerCase() === expected.sha256 &&
    String(custom.byteLength) === expected.byteLength &&
    String(custom.mimeType || "").toLowerCase() === expected.mimeType.toLowerCase() &&
    custom.ownerDigest === expected.ownerDigest &&
    custom.jobDigest === expected.jobDigest &&
    custom.kind === expected.kind;
}

async function verifyRemoteBytes(
  file: EditorBlobFile,
  expected: ReturnType<typeof expectedMetadata>,
): Promise<void> {
  if (!file.download) throw new Error("EDITOR_SOURCE_DURABLE_READ_UNAVAILABLE");
  const [bytes] = await file.download();
  if (!Buffer.isBuffer(bytes) || bytes.byteLength !== Number(expected.byteLength)) {
    throw new Error("EDITOR_SOURCE_DURABLE_BYTE_LENGTH_MISMATCH");
  }
  const actualDigest = createHash("sha256").update(bytes).digest("hex");
  if (actualDigest !== expected.sha256) {
    throw new Error("EDITOR_SOURCE_DURABLE_DIGEST_MISMATCH");
  }
}

async function persistOne(
  storage: EditorBlobStorage,
  input: {
    storageKey: string;
    filePath: string;
    ownerId: string;
    jobId: string;
    sha256: string;
    byteLength: number;
    mimeType: string;
    kind: "ASSET" | "COMPOSITION";
  },
): Promise<void> {
  const stat = fs.statSync(input.filePath);
  if (!stat.isFile() || stat.size <= 0 || stat.size !== input.byteLength ||
      stat.size > MAX_EDITOR_SOURCE_BLOB_BYTES) {
    throw new Error("EDITOR_SOURCE_DURABLE_LOCAL_SIZE_INVALID");
  }
  const bytes = fs.readFileSync(input.filePath);
  const actualSha = createHash("sha256").update(bytes).digest("hex");
  if (actualSha !== input.sha256.toLowerCase()) {
    throw new Error("EDITOR_SOURCE_DURABLE_LOCAL_DIGEST_INVALID");
  }

  const expected = expectedMetadata(input);
  const file = storage.file(input.storageKey);
  if (!file.getMetadata || !file.save) throw new Error("EDITOR_SOURCE_DURABLE_WRITE_UNAVAILABLE");

  const [exists] = file.exists ? await file.exists() : [false];
  if (exists) {
    const [metadata] = await file.getMetadata();
    if (!metadataMatches(metadata, expected)) {
      throw new Error("EDITOR_SOURCE_DURABLE_EXISTING_OBJECT_BINDING_MISMATCH");
    }
    await verifyRemoteBytes(file, expected);
    return;
  }

  try {
    await file.save(bytes, {
      resumable: false,
      validation: "crc32c",
      preconditionOpts: { ifGenerationMatch: 0 },
      metadata: {
        contentType: input.mimeType,
        cacheControl: "private, no-store",
        metadata: expected,
      },
    });
  } catch (error) {
    // Concurrent package creation may win the create-only write. Accept only an
    // existing object that independently matches both the metadata and bytes.
    const [nowExists] = file.exists ? await file.exists().catch(() => [false] as [boolean]) : [false];
    if (!nowExists) throw error;
    const [metadata] = await file.getMetadata();
    if (!metadataMatches(metadata, expected)) throw new Error("EDITOR_SOURCE_DURABLE_RACE_BINDING_MISMATCH");
  }

  const [metadata] = await file.getMetadata();
  if (!metadataMatches(metadata, expected)) throw new Error("EDITOR_SOURCE_DURABLE_UPLOAD_METADATA_MISMATCH");
  await verifyRemoteBytes(file, expected);
}

/**
 * Uploads all immutable package blobs and returns owner/job-namespaced keys.
 * In production, missing durable storage is a hard package-creation failure.
 */
export async function persistEditorSourcePackageBlobs(input: {
  readonly ownerId: string;
  readonly jobId: string;
  readonly compositionPath: string;
  readonly compositionSha256: string;
  readonly compositionByteLength: number;
  readonly sourceAssets: readonly EditorSourcePackageAsset[];
  readonly cas: ContentAddressedStore;
  readonly storage?: EditorBlobStorage;
}): Promise<PersistedEditorSourceBlobs | null> {
  const storage = requireBlobStorage(input.storage);
  if (!storage) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("EDITOR_SOURCE_DURABLE_STORAGE_UNAVAILABLE");
    }
    return null;
  }

  const sourceAssetStorageKeys: Record<string, string> = {};
  for (const asset of input.sourceAssets) {
    const ref = input.cas.getByHash(asset.sha256.toLowerCase());
    if (!ref?.uri || !fs.existsSync(ref.uri) || ref.byteLength !== asset.byteLength ||
        ref.mimeType !== asset.mimeType) {
      throw new Error("EDITOR_SOURCE_DURABLE_CAS_REFERENCE_INVALID");
    }
    const storageKey = editorSourceStorageKey(
      "assets", input.ownerId, input.jobId, asset.sha256, asset.mimeType,
    );
    await persistOne(storage, {
      storageKey,
      filePath: ref.uri,
      ownerId: input.ownerId,
      jobId: input.jobId,
      sha256: asset.sha256,
      byteLength: asset.byteLength,
      mimeType: asset.mimeType,
      kind: "ASSET",
    });
    sourceAssetStorageKeys[asset.sha256.toLowerCase()] = storageKey;
  }

  const compositionStorageKey = editorSourceStorageKey(
    "compositions",
    input.ownerId,
    input.jobId,
    input.compositionSha256,
    "application/json",
  );
  await persistOne(storage, {
    storageKey: compositionStorageKey,
    filePath: input.compositionPath,
    ownerId: input.ownerId,
    jobId: input.jobId,
    sha256: input.compositionSha256,
    byteLength: input.compositionByteLength,
    mimeType: "application/json",
    kind: "COMPOSITION",
  });
  return { compositionStorageKey, sourceAssetStorageKeys };
}

/**
 * Rehydrates missing local CAS blobs from the durable store after validating the
 * key's owner/job scope, provider metadata, physical byte length and digest.
 * Existing but corrupted local blobs are left for the caller's forensic checks
 * to reject; they are never silently replaced by this recovery path.
 */
export async function hydrateEditorSourcePackageBlobs(input: {
  readonly packageRecord: EditorSourcePackageRecord;
  readonly ownerId: string;
  readonly jobId: string;
  readonly cas: ContentAddressedStore;
  readonly storage?: EditorBlobStorage;
}): Promise<void> {
  const pkg = input.packageRecord;
  if (pkg.ownerId !== input.ownerId || pkg.sourceJobId !== input.jobId) {
    throw new Error("EDITOR_SOURCE_DURABLE_PACKAGE_BINDING_MISMATCH");
  }

  const storage = requireBlobStorage(input.storage);
  const hydrateOne = async (args: {
    sha256: string;
    byteLength: number;
    mimeType: string;
    storageKey?: string;
    kind: "ASSET" | "COMPOSITION";
  }) => {
    const existing = input.cas.getByHash(args.sha256.toLowerCase());
    if (existing?.uri && fs.existsSync(existing.uri)) return;
    if (!args.storageKey) throw new Error("EDITOR_SOURCE_DURABLE_KEY_MISSING");
    if (!storage) throw new Error("EDITOR_SOURCE_DURABLE_STORAGE_UNAVAILABLE");

    const expectedKey = editorSourceStorageKey(
      args.kind === "COMPOSITION" ? "compositions" : "assets",
      input.ownerId,
      input.jobId,
      args.sha256,
      args.mimeType,
    );
    if (args.storageKey !== expectedKey) throw new Error("EDITOR_SOURCE_DURABLE_KEY_BINDING_INVALID");
    if (!/^[a-f0-9]{64}$/i.test(args.sha256) ||
        !Number.isSafeInteger(args.byteLength) ||
        args.byteLength <= 0 ||
        args.byteLength > MAX_EDITOR_SOURCE_BLOB_BYTES) {
      throw new Error("EDITOR_SOURCE_DURABLE_MANIFEST_INVALID");
    }

    const file = storage.file(args.storageKey);
    if (!file.getMetadata || !file.download) throw new Error("EDITOR_SOURCE_DURABLE_READ_UNAVAILABLE");
    const [exists] = file.exists ? await file.exists() : [false];
    if (!exists) throw new Error("EDITOR_SOURCE_DURABLE_BLOB_MISSING");
    const expected = expectedMetadata({
      ownerId: input.ownerId,
      jobId: input.jobId,
      sha256: args.sha256,
      byteLength: args.byteLength,
      mimeType: args.mimeType,
      kind: args.kind,
    });
    const [metadata] = await file.getMetadata();
    if (!metadataMatches(metadata, expected)) {
      throw new Error("EDITOR_SOURCE_DURABLE_METADATA_BINDING_MISMATCH");
    }
    const [bytes] = await file.download();
    if (!Buffer.isBuffer(bytes) || bytes.byteLength !== args.byteLength) {
      throw new Error("EDITOR_SOURCE_DURABLE_BYTE_LENGTH_MISMATCH");
    }
    const actualSha = createHash("sha256").update(bytes).digest("hex");
    if (actualSha !== args.sha256.toLowerCase()) {
      throw new Error("EDITOR_SOURCE_DURABLE_DIGEST_MISMATCH");
    }

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "shortforge-editor-cas-"));
    const tempPath = path.join(tempDir, "rehydrated" + extensionForMime(args.mimeType));
    try {
      fs.writeFileSync(tempPath, bytes, { flag: "wx" });
      const ref = await input.cas.putFile(tempPath, args.kind === "COMPOSITION" ? "editor_source_composition" : "editor_source_asset", args.mimeType, {
        sourceJobId: input.jobId,
        importedBy: input.ownerId,
        durableStorageKey: args.storageKey,
      });
      if (ref.sha256 !== args.sha256.toLowerCase() ||
          ref.byteLength !== args.byteLength ||
          ref.mimeType !== args.mimeType) {
        throw new Error("EDITOR_SOURCE_DURABLE_CAS_REHYDRATION_MISMATCH");
      }
    } finally {
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
    }
  };

  // Rehydrate assets first, then composition; the route validates semantic
  // references and ownership after physical blobs are back in local CAS.
  for (const asset of pkg.sourceAssets) {
    await hydrateOne({
      sha256: asset.sha256,
      byteLength: asset.byteLength,
      mimeType: asset.mimeType,
      storageKey: asset.storageKey,
      kind: "ASSET",
    });
  }
  await hydrateOne({
    sha256: pkg.compositionSha256,
    byteLength: pkg.compositionByteLength,
    mimeType: "application/json",
    storageKey: pkg.compositionStorageKey,
    kind: "COMPOSITION",
  });
}
