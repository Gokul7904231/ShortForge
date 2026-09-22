/**
 * GET  /api/publish/queue    — queue stats + jobs
 * POST /api/publish/queue    — enqueue a publish job
 * DELETE /api/publish/queue?id= — retry dead-letter publish job
 *
 * POST /api/publish/now      — publish immediately (skip queue)
 */
import { NextResponse } from "next/server";
import "../../../../publishing/index";
import { PublisherQueue } from "../../../../publishing/publisher-queue";
import { PublishingRegistry } from "../../../../publishing/publishing-registry";
import { verifySession, UnauthorizedError, ForbiddenError } from "../../../../lib/auth/auth";

export async function GET(req: Request) {
  try {
    const stats = PublisherQueue.getStats();
    const healthReports = await Promise.allSettled(
      PublishingRegistry.getAllProviders().map(async (p) => ({
        id: p.id,
        name: p.name,
        health: await p.healthCheck(),
      }))
    );

    return NextResponse.json({
      success: true,
      stats,
      platforms: healthReports
        .filter((r) => r.status === "fulfilled")
        .map((r) => (r as PromiseFulfilledResult<any>).value),
      queue: PublisherQueue.getQueue().map((j) => ({
        id: j.id,
        jobId: j.jobId,
        platform: j.platform,
        status: j.status,
        attempts: j.attempts,
        nextRetryAt: j.nextRetryAt,
        lastError: j.lastError,
        createdAt: new Date(j.createdAt).toISOString(),
      })),
      deadLetterQueue: PublisherQueue.getDeadLetterQueue().map((j) => ({
        id: j.id,
        jobId: j.jobId,
        platform: j.platform,
        attempts: j.attempts,
        lastError: j.lastError,
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    // 1. Enforce API Caller Authentication (P0-G)
    await verifySession(req);

    const body = await req.json();
    const {
      jobId,
      platforms,
      videoUrl,
      title,
      description,
      tags,
      thumbnailUrl,
      engine,
      immediate,
      authorization,
      channelId,
      privacyStatus,
      publishAt,
      containsSyntheticMedia,
      selfDeclaredMadeForKids,
      videoArtifactHash,
    } = body ?? {};

    if (!jobId || !platforms || !videoUrl || !title) {
      return NextResponse.json(
        { error: "Missing required fields: jobId, platforms, videoUrl, title" },
        { status: 400 }
      );
    }

    // 2. Fail-Closed Guard: All publications REQUIRE authentic ReleaseAuthorization capability (P0-A)
    if (!authorization) {
      return NextResponse.json(
        {
          error:
            "NO_VALID_F07_RELEASE_AUTHORIZATION: Cannot publish to any platform without an unforgeable ReleaseAuthorization capability.",
        },
        { status: 403 }
      );
    }

    const payload = {
      jobId,
      videoUrl,
      title,
      description,
      tags,
      thumbnailUrl,
      engine,
      authorization,
      channelId,
      privacyStatus,
      publishAt,
      containsSyntheticMedia,
      selfDeclaredMadeForKids,
      videoArtifactHash,
    };

    if (immediate) {
      // Direct publish with fail-closed provider execution
      const results = await Promise.allSettled(
        platforms.map(async (platform: string) => {
          const provider = PublishingRegistry.getProvider(platform);
          return provider.publish(payload);
        })
      );
      return NextResponse.json({
        success: true,
        mode: "immediate",
        results: results.map((r, i) =>
          r.status === "fulfilled"
            ? { platform: platforms[i], ...r.value }
            : { platform: platforms[i], success: false, error: (r as PromiseRejectedResult).reason?.message }
        ),
      });
    }

    // Queue publish jobs
    const jobs = platforms.map((platform: string) =>
      PublisherQueue.enqueue({ jobId, platform, payload })
    );

    return NextResponse.json({
      success: true,
      mode: "queued",
      jobs: jobs.map((j) => ({ id: j.id, platform: j.platform, status: j.status })),
    });
  } catch (err: any) {
    if (err instanceof UnauthorizedError || err.name === "UnauthorizedError") {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof ForbiddenError || err.name === "ForbiddenError") {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    // 1. Enforce API Caller Authentication (P0-G)
    await verifySession(req);

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const retried = PublisherQueue.retryDead(id);
    if (!retried) {
      return NextResponse.json({ error: "Job not found in dead-letter queue" }, { status: 404 });
    }
    return NextResponse.json({ success: true, retried: true, id });
  } catch (err: any) {
    if (err instanceof UnauthorizedError || err.name === "UnauthorizedError") {
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    if (err instanceof ForbiddenError || err.name === "ForbiddenError") {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
