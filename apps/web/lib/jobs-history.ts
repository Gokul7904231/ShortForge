import { db } from "./firebase-admin";
import type { EditorSourcePackageRecord } from "../factoryos/core/editor/EditorSourcePackage";

export interface VideoJob {
  id: string;
  jobId: string;
  userId: string;
  script: string;
  contentType: "MOTIVATIONAL" | "FACTS" | "STORY" | "QUIZ_SHORTS";
  videoUrl: string | null;
  localVideoPath?: string | null;
  cloudinaryPublicId: string | null;
  status: "queued" | "processing" | "completed" | "failed" | "purged";
  createdAt: any;
  renderDurationSeconds: number;
  videoSizeMb: number;
  topic?: string;
  thumbnailUrl?: string;
  renderProfile?: string;
  fps?: number;
  resolution?: string;
  timings?: any;
  cache?: any;
  quizData?: any;
  scenes?: any;
  error?: string;
  errorMessage?: string;
  missionId?: string;
  executionToken?: string;
  executionAuthority?: string;
  tier?: string;
  targetWorkerPool?: string;
  duration?: number;
  downloadUrl?: string;
  completedAt?: string;
  updatedAt?: string;
  remoteState?: string;
  artifactSha256?: string;
  /** Durable owner binding for the media package imported into ShortForge Editor. */
  editorSource?: {
    sha256: string;
    artifactId: string;
    byteLength: number;
    sourceKind: "FLATTENED_MP4";
    ownerId: string;
    importedAt: string;
  };
  /** Immutable per-scene source composition package, when all source assets were resolved into CAS. */
  editorSourcePackage?: EditorSourcePackageRecord;
  /** Digest-bound server record for the canonical first composition of a flattened MP4 import. */
  editorSourceComposition?: {
    schemaVersion: "shortforge.editor-composition-binding.v1";
    compositionId: string;
    sha256: string;
    artifactId: string;
    byteLength: number;
    sourceKind: "FLATTENED_MP4";
    ownerId: string;
    createdAt: string;
  };
}

const inMemoryJobs = new Map<string, VideoJob>();

export function getInMemoryJobs(): Map<string, VideoJob> {
  return inMemoryJobs;
}

// Replaces reading a local index.json file
export async function getJobsIndex(userId: string = "anonymous"): Promise<VideoJob[]> {
  const localList = Array.from(inMemoryJobs.values()).filter(j => userId === "anonymous" || j.userId === userId);

  if (db) {
    try {
      const snapshot = await db
        .collection("videos")
        .where("userId", "==", userId)
        .orderBy("createdAt", "desc")
        .get();

      const jobs: VideoJob[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        jobs.push({ id: doc.id, jobId: doc.id, ...data } as VideoJob);
      });
      return jobs.length > 0 ? jobs : localList;
    } catch {
      return localList;
    }
  }
  return localList;
}

// Replaces writing to individual local JSON sheets
export async function saveJobManifest(jobId: string, payload: Partial<VideoJob>): Promise<void> {
  const existing = inMemoryJobs.get(jobId) || {
    id: jobId,
    jobId,
    userId: "anonymous",
    script: "",
    contentType: "QUIZ_SHORTS",
    videoUrl: null,
    cloudinaryPublicId: null,
    status: "queued",
    createdAt: new Date().toISOString(),
    renderDurationSeconds: 0,
    videoSizeMb: 0,
  };
  const updated = { ...existing, ...payload, updatedAt: new Date().toISOString() } as VideoJob;
  inMemoryJobs.set(jobId, updated);

  if (db) {
    const cleanPayload = JSON.parse(JSON.stringify(updated));
    db.collection("videos")
      .doc(jobId)
      .set(cleanPayload, { merge: true })
      .catch((err: any) => {
        console.warn("[JobsHistory] Firestore write warning:", err.message);
      });
  }
}

// Replaces fetching a local file sheet
export async function readJobManifest(jobId: string): Promise<VideoJob | null> {
  if (inMemoryJobs.has(jobId)) {
    return inMemoryJobs.get(jobId) || null;
  }
  if (db) {
    try {
      const doc = await db.collection("videos").doc(jobId).get();
      if (!doc.exists) return null;
      const data = doc.data();
      return { id: doc.id, jobId: doc.id, ...data } as VideoJob;
    } catch {
      return null;
    }
  }
  return null;
}

// Keep backward compatible writeJobManifest/upsertJobIndexItem exports for compatibility
export async function writeJobManifest(jobId: string, manifest: any) {
  await saveJobManifest(jobId, manifest);
}

export async function upsertJobIndexItem(item: any) {
  await saveJobManifest(item.jobId, item);
}
