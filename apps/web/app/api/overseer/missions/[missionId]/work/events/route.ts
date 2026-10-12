import { NextRequest, NextResponse } from "next/server";
import { getFactoryOSController } from "@/lib/overseer/factoryos-runtime";
import { resolveCollaborationActor } from "@/lib/overseer/collaboration-auth";
import { projectMissionWorkSignal } from "@/components/overseer/collaboration/mission-work-events";

interface RouteContext {
  params: Promise<{ missionId: string }>;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const encoder = new TextEncoder();

function authStatus(error: unknown): number {
  const message = error instanceof Error ? error.message : "";
  if (message === "UNAUTHORIZED") return 401;
  if (message.includes("access") || message.includes("permission")) return 403;
  return 500;
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const { missionId } = await context.params;
    const actor = await resolveCollaborationActor(request);
    const factory = await getFactoryOSController();
    const mission = await factory.missionManager.getMission(missionId);
    if (!mission) {
      return NextResponse.json({ success: false, error: "Mission not found." }, { status: 404 });
    }

    const room = await factory.collaborationStore.getRoom(missionId);
    if (room) {
      if (!factory.collaborationStore.canReadRoom(room, actor)) {
        return NextResponse.json({ success: false, error: "Mission work board access denied." }, { status: 403 });
      }
    } else if (actor.workspaceRole === "VIEWER") {
      return NextResponse.json({ success: false, error: "Open membership is required to view mission work events." }, { status: 403 });
    }

    const requestedCursor = request.headers.get("last-event-id") ||
      request.nextUrl.searchParams.get("lastEventId") || "";
    if (requestedCursor && !/^[A-Za-z0-9_-]{1,128}$/.test(requestedCursor)) {
      return NextResponse.json({ success: false, error: "Invalid event cursor." }, { status: 400 });
    }

    const stream = new ReadableStream<Uint8Array>({
      start(streamController) {
        let closed = false;
        let replaying = true;
        const pending: Array<NonNullable<ReturnType<typeof projectMissionWorkSignal>>> = [];
        const deliveredIds = new Set<string>();
        let keepalive: ReturnType<typeof setInterval> | undefined;
        let unsubscribe = () => {};

        const send = (data: unknown, id?: string) => {
          if (closed) return;
          try {
            const safeId = id && /^[A-Za-z0-9_-]{1,128}$/.test(id) ? `id: ${id}\n` : "";
            streamController.enqueue(encoder.encode(
              `${safeId}data: ${JSON.stringify(data)}\n\n`,
            ));
          } catch {
            close();
          }
        };

        const sendSignal = (signal: NonNullable<ReturnType<typeof projectMissionWorkSignal>>) => {
          if (deliveredIds.has(signal.eventId)) return;
          deliveredIds.add(signal.eventId);
          send(signal, signal.eventId);
        };

        const close = () => {
          if (closed) return;
          closed = true;
          if (keepalive) clearInterval(keepalive);
          unsubscribe();
          request.signal.removeEventListener("abort", onAbort);
          try { streamController.close(); } catch {}
        };

        const onAbort = () => close();

        // Subscribe before sampling history. Live signals are buffered until replay is complete.
        unsubscribe = factory.eventBus.subscribeWildcard((rawEvent: unknown) => {
          const signal = projectMissionWorkSignal(rawEvent, missionId);
          if (!signal || closed) return;
          if (replaying) pending.push(signal);
          else sendSignal(signal);
        });

        const history = factory.eventBus.getEvents(5000);
        const latest = history[history.length - 1];
        if (requestedCursor) {
          const cursorIndex = history.findIndex((event) => event.eventId === requestedCursor);
          if (cursorIndex < 0) {
            // History has rolled over or the process restarted; force an authoritative snapshot refresh.
            send({ type: "RESYNC_REQUIRED", missionId }, latest?.eventId);
          } else {
            for (const event of history.slice(cursorIndex + 1)) {
              const signal = projectMissionWorkSignal(event, missionId);
              if (signal) sendSignal(signal);
            }
          }
        }

        for (const signal of pending) sendSignal(signal);
        replaying = false;

        const cursorAfterDrain = factory.eventBus.getEvents(5000);
        const currentCursor = cursorAfterDrain[cursorAfterDrain.length - 1]?.eventId;
        send({ type: "CONNECTED", missionId }, currentCursor);

        keepalive = setInterval(() => {
          if (closed) return;
          try {
            streamController.enqueue(encoder.encode(": keepalive\n\n"));
          } catch {
            close();
          }
        }, 15000);

        request.signal.addEventListener("abort", onAbort, { once: true });
        if (request.signal.aborted) close();
      },
      cancel() {
        // Abort signal also cleans up; this is an additional safety path for consumers that cancel.
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    const status = authStatus(error);
    const message = status === 401 ? "Unauthorized." :
      status === 403 ? "Mission work event access denied." :
      "Mission work event stream unavailable.";
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
