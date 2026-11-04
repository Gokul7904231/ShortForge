import { db } from "../firebase-admin";
import { getInMemoryJobs, readJobManifest } from "../jobs-history";
import { verifySession } from "./auth";
import { isAdminUser } from "./roles";

/**
 * Authorization for job-scoped media. A job document is the ownership record.
 * Content-addressed ids carry no owner, so they are resolved through the jobs
 * that reference the hash. Unknown ownership fails closed for non-admins.
 */

export interface JobAccessPrincipal {
  uid: string;
  role: string;
}

export interface JobAccessDecision {
  status: 200 | 401 | 403 | 404;
  error?: string;
}

export function decideJobAccess(
  principal: JobAccessPrincipal | null,
  owners: string[]
): JobAccessDecision {
  if (!principal?.uid) {
    return { status: 401, error: "Unauthorized" };
  }
  if (isAdminUser(principal.role)) {
    return { status: 200 };
  }
  if (owners.length === 0) {
    // Do not confirm that an unowned artifact exists.
    return { status: 404, error: "Video not found" };
  }
  if (owners.includes(principal.uid)) {
    return { status: 200 };
  }
  return { status: 403, error: "Forbidden" };
}

export async function authorizeJobRequest(
  req: Request,
  jobId: string
): Promise<JobAccessDecision> {
  let principal: JobAccessPrincipal | null = null;
  try {
    const { user } = await verifySession(req);
    principal = { uid: user.uid, role: user.role };
  } catch (err: any) {
    return { status: 401, error: err?.message || "Unauthorized" };
  }

  const owners = await resolveJobOwners(jobId);
  return decideJobAccess(principal, owners);
}

export async function resolveJobOwners(jobId: string): Promise<string[]> {
  const owners = new Set<string>();

  try {
    const manifest = await readJobManifest(jobId);
    if (manifest?.userId && manifest.userId !== "anonymous") {
      owners.add(manifest.userId);
    }
  } catch {
    // Fall through to hash resolution.
  }

  const hash = jobId.replace(/^cas_/i, "");
  if (/^[a-f0-9]{64}$/i.test(hash)) {
    for (const job of getInMemoryJobs().values()) {
      if (
        job.artifactSha256?.toLowerCase() === hash.toLowerCase() &&
        job.userId &&
        job.userId !== "anonymous"
      ) {
        owners.add(job.userId);
      }
    }

    if (db && owners.size === 0) {
      try {
        const snapshot = await db
          .collection("videos")
          .where("artifactSha256", "==", hash)
          .limit(20)
          .get();
        snapshot.forEach((doc) => {
          const userId = doc.data()?.userId;
          if (typeof userId === "string" && userId !== "anonymous") owners.add(userId);
        });
      } catch {
        // Unresolved ownership stays empty and fails closed below.
      }
    }
  }

  return [...owners];
}
