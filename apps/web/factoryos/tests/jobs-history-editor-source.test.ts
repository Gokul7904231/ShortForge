import { beforeEach, describe, expect, it, vi } from "vitest";

const firestoreTestDouble = vi.hoisted(() => {
  const documents = new Map<string, Record<string, unknown>>();
  let failReads = false;
  let failWrites = false;

  const db = {
    collection: (_collectionName: string) => ({
      doc: (id: string) => ({
        get: async () => {
          if (failReads) throw new Error("test firestore read failure");
          const value = documents.get(id);
          return {
            id,
            exists: Boolean(value),
            data: () => value,
          };
        },
        set: async (value: Record<string, unknown>, options?: { merge?: boolean }) => {
          if (failWrites) throw new Error("test firestore write failure");
          const previous = documents.get(id) ?? {};
          documents.set(id, options?.merge ? { ...previous, ...value } : { ...value });
        },
      }),
    }),
  };

  return {
    db,
    documents,
    setFailReads: (value: boolean) => { failReads = value; },
    setFailWrites: (value: boolean) => { failWrites = value; },
  };
});

vi.mock("@/lib/firebase-admin", () => ({ db: firestoreTestDouble.db }));

import { getInMemoryJobs, saveJobManifest } from "../../lib/jobs-history";

describe("editor source job-manifest durability", () => {
  beforeEach(() => {
    firestoreTestDouble.documents.clear();
    firestoreTestDouble.setFailReads(false);
    firestoreTestDouble.setFailWrites(false);
    getInMemoryJobs().clear();
  });

  it("merges an editor source binding into the persisted job on a cold application instance", async () => {
    const jobId = "job-editor-cold-start";
    const persistedJob = {
      id: jobId,
      jobId,
      userId: "creator-123",
      topic: "Tamil Nadu quiz",
      status: "completed",
      videoUrl: "https://cdn.example.test/verified-short.mp4",
      artifactSha256: "a".repeat(64),
      createdAt: "2026-10-13T10:00:00.000Z",
      contentType: "QUIZ_SHORTS",
    };
    firestoreTestDouble.documents.set(jobId, { ...persistedJob });

    // An empty process-local map simulates a cold web instance handling an editor request.
    await saveJobManifest(jobId, {
      editorSourceComposition: {
        schemaVersion: "shortforge.editor-composition-binding.v1",
        compositionId: "sf-editor-composition",
        sha256: "b".repeat(64),
        artifactId: "artifact-editor-composition",
        byteLength: 512,
        sourceKind: "FLATTENED_MP4",
        ownerId: "creator-123",
        createdAt: "2026-10-13T10:01:00.000Z",
      },
    });

    const saved = firestoreTestDouble.documents.get(jobId)!;
    expect(saved.userId).toBe("creator-123");
    expect(saved.status).toBe("completed");
    expect(saved.videoUrl).toBe(persistedJob.videoUrl);
    expect(saved.artifactSha256).toBe(persistedJob.artifactSha256);
    expect(saved.topic).toBe("Tamil Nadu quiz");
    expect(saved.editorSourceComposition).toMatchObject({
      ownerId: "creator-123",
      sourceKind: "FLATTENED_MP4",
    });
  });

  it("fails closed before mutating memory when the existing job cannot be read", async () => {
    const jobId = "job-editor-read-failure";
    firestoreTestDouble.setFailReads(true);

    await expect(saveJobManifest(jobId, {
      editorSource: {
        sha256: "c".repeat(64),
        artifactId: "artifact",
        byteLength: 42,
        sourceKind: "FLATTENED_MP4",
        ownerId: "creator-123",
        importedAt: "2026-10-13T10:01:00.000Z",
      },
    })).rejects.toThrow("EDITOR_SOURCE_PACKAGE_PERSISTENCE_READ_FAILED");

    expect(getInMemoryJobs().has(jobId)).toBe(false);
    expect(firestoreTestDouble.documents.has(jobId)).toBe(false);
  });

  it("rolls back the in-memory source binding if the durable write fails", async () => {
    const jobId = "job-editor-write-failure";
    const previous = {
      id: jobId,
      jobId,
      userId: "creator-123",
      status: "completed",
      topic: "Preserve this job",
    };
    firestoreTestDouble.documents.set(jobId, { ...previous });
    getInMemoryJobs().set(jobId, { ...previous } as any);
    firestoreTestDouble.setFailWrites(true);

    await expect(saveJobManifest(jobId, {
      editorSourcePackage: {
        schemaVersion: "shortforge.editor-source.v1",
        sourceKind: "COMPOSITION_PACKAGE",
        sourceJobId: jobId,
        ownerId: "creator-123",
        compositionId: "composition",
        compositionArtifactId: "artifact",
        compositionSha256: "d".repeat(64),
        compositionByteLength: 100,
        compositionHashSha256: "e".repeat(64),
        sourceAssetSha256s: ["f".repeat(64)],
        sourceAssets: [],
        renderIntentId: "intent",
        timelineFingerprint: "f".repeat(64),
        createdAt: "2026-10-13T10:01:00.000Z",
      },
    })).rejects.toThrow("EDITOR_SOURCE_PACKAGE_PERSISTENCE_FAILED");

    expect(getInMemoryJobs().get(jobId)).toMatchObject(previous);
    expect(firestoreTestDouble.documents.get(jobId)).toMatchObject(previous);
    expect(firestoreTestDouble.documents.get(jobId)).not.toHaveProperty("editorSourcePackage");
  });
});
