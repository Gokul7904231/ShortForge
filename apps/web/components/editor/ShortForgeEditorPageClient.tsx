"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, CircleAlert, Download, LoaderCircle, Save, ShieldAlert } from "lucide-react";

import ShortForgeEditorStudio from "@/components/editor/ShortForgeEditorStudio";
import type {
  EditorActor,
  EditorCommandEnvelope,
  EditorDocument,
} from "@/factoryos/core/editor/EditorContracts";
import type { CompositionIR } from "@/factoryos/core/timeline/CompositionIR";

interface EditorSourceResponse {
  success: boolean;
  error?: string;
  sourceKind: "FLATTENED_MP4";
  sourceNotice: string;
  job: {
    jobId: string;
    title: string;
    contentType: string;
    durationSeconds: number;
  };
  videoUrl: string;
  media: {
    width: number;
    height: number;
    fps: number;
    durationSeconds: number;
    byteLength: number;
    sha256: string;
  };
  composition: CompositionIR;
}

interface RuntimeResponse {
  success: boolean;
  error?: string;
  actor?: EditorActor;
  document?: EditorDocument;
  receipt?: { accepted?: boolean; error?: string; revision?: number };
  checkpoint?: { checkpointId?: string };
  preview?: { previewUrl?: string; previewArtifactSha256?: string };
}

function sessionStorageKey(compositionId: string): string {
  return "shortforge.editor.session." + compositionId;
}

function stableSessionId(compositionId: string): string {
  if (typeof window === "undefined") return "";
  const key = sessionStorageKey(compositionId);
  const current = window.sessionStorage.getItem(key);
  if (current) return current;
  const next = globalThis.crypto?.randomUUID?.() || "editor-" + Date.now().toString(36);
  window.sessionStorage.setItem(key, next);
  return next;
}

async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(body.error || ("Request failed (" + response.status + ")."));
  }
  return body;
}

export default function ShortForgeEditorPageClient({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [source, setSource] = useState<EditorSourceResponse | null>(null);
  const [document, setDocument] = useState<EditorDocument | null>(null);
  const [actor, setActor] = useState<EditorActor | null>(null);
  const [sessionId, setSessionId] = useState("");
  const [previewFrameUrl, setPreviewFrameUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("Opening verified source…");

  const runtimeUrl = source?.composition.compositionId
    ? "/api/editor/runtime?compositionId=" +
      encodeURIComponent(source.composition.compositionId) +
      "&sessionId=" +
      encodeURIComponent(sessionId)
    : "";

  const refreshDocument = useCallback(async () => {
    if (!source || !sessionId) return null;
    const response = await fetch(runtimeUrl, { cache: "no-store" });
    const payload = await readJson<RuntimeResponse>(response);
    if (!payload.document || !payload.actor) throw new Error("Editor runtime did not return a document.");
    setDocument(payload.document);
    setActor(payload.actor);
    return payload.document;
  }, [runtimeUrl, sessionId, source]);

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      setLoading(true);
      setError("");
      setSource(null);
      setDocument(null);
      setActor(null);
      setPreviewFrameUrl("");

      if (!jobId) {
        setError("Open the editor from a completed Short using its Edit button.");
        setStatus("Missing source video");
        setLoading(false);
        return;
      }

      try {
        setStatus("Verifying the completed Short…");
        const sourceResponse = await fetch("/api/editor/source/" + encodeURIComponent(jobId), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
          cache: "no-store",
        });
        const sourcePayload = await readJson<EditorSourceResponse>(sourceResponse);
        if (cancelled) return;

        if (!sourcePayload.composition || sourcePayload.composition.schemaVersion !== "2.0.0") {
          throw new Error("Source import did not return a supported CompositionIR document.");
        }
        setSource(sourcePayload);
        setStatus("Opening edit session…");

        const nextSessionId = stableSessionId(sourcePayload.composition.compositionId);
        setSessionId(nextSessionId);
        const query =
          "/api/editor/runtime?compositionId=" +
          encodeURIComponent(sourcePayload.composition.compositionId) +
          "&sessionId=" +
          encodeURIComponent(nextSessionId);

        const resumeResponse = await fetch(query, { cache: "no-store" });
        let runtimePayload: RuntimeResponse;
        if (resumeResponse.ok) {
          runtimePayload = await readJson<RuntimeResponse>(resumeResponse);
        } else if (resumeResponse.status === 404) {
          const openResponse = await fetch("/api/editor/runtime", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              operation: "open",
              sessionId: nextSessionId,
              composition: sourcePayload.composition,
            }),
          });
          runtimePayload = await readJson<RuntimeResponse>(openResponse);
        } else {
          runtimePayload = await readJson<RuntimeResponse>(resumeResponse);
        }

        if (cancelled) return;
        if (!runtimePayload.document || !runtimePayload.actor) {
          throw new Error("Editor runtime could not open the imported Short.");
        }
        setDocument(runtimePayload.document);
        setActor(runtimePayload.actor);
        setStatus("Ready to edit · changes are versioned automatically");
      } catch (cause) {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : String(cause));
        setStatus("Editor could not be opened");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void initialize();
    return () => {
      cancelled = true;
    };
  }, [jobId]);

  const applyCommand = useCallback(
    async (envelope: EditorCommandEnvelope) => {
      if (!source || !document || !sessionId) return;
      setBusy(true);
      setError("");
      try {
        const response = await fetch("/api/editor/runtime", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            operation: "apply",
            compositionId: source.composition.compositionId,
            sessionId,
            commandId: envelope.commandId,
            expectedRevision: envelope.expectedRevision,
            command: envelope.command,
          }),
        });
        const payload = await readJson<RuntimeResponse>(response);
        if (!payload.success || payload.receipt?.accepted === false) {
          setError(payload.receipt?.error || "Edit was not accepted. Reloading the current revision.");
          await refreshDocument();
          return payload;
        }
        await refreshDocument();
        setPreviewFrameUrl("");
        setStatus("Saved as a new revision");
        return payload;
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [document, refreshDocument, sessionId, source],
  );

  const runHistoryOperation = useCallback(
    async (operation: "undo" | "redo" | "checkpoint") => {
      if (!source || !document || !sessionId) return;
      setBusy(true);
      setError("");
      try {
        const response = await fetch("/api/editor/runtime", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            operation,
            compositionId: source.composition.compositionId,
            sessionId,
            expectedRevision: document.revision,
            reason: operation === "checkpoint" ? "User saved an editor checkpoint" : undefined,
          }),
        });
        const payload = await readJson<RuntimeResponse>(response);
        if (payload.receipt?.accepted === false) {
          setError(payload.receipt.error || "The history operation was not accepted.");
        }
        await refreshDocument();
        if (operation === "checkpoint") {
          setStatus("Checkpoint saved");
        } else {
          setPreviewFrameUrl("");
          setStatus(operation === "undo" ? "Undo complete" : "Redo complete");
        }
        return payload;
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [document, refreshDocument, sessionId, source],
  );

  const previewAt = useCallback(
    async (seconds: number) => {
      if (!source || !sessionId) return;
      setBusy(true);
      setError("");
      try {
        const response = await fetch("/api/editor/runtime", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            operation: "preview",
            compositionId: source.composition.compositionId,
            sessionId,
            timestampSeconds: seconds,
          }),
        });
        const payload = await readJson<RuntimeResponse>(response);
        if (!payload.success || !payload.preview?.previewUrl) {
          throw new Error("The preview renderer did not return a frame.");
        }
        const cacheKey = document?.revision ?? 0;
        const previewQuery = new URLSearchParams({
          compositionId: source.composition.compositionId,
          sessionId,
          timestampSeconds: String(seconds),
          revision: String(cacheKey),
          t: String(Date.now()),
        });
        setPreviewFrameUrl(payload.preview.previewUrl + "?" + previewQuery.toString());
        setStatus("Physical preview rendered at " + seconds.toFixed(2) + "s");
        return payload.preview;
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [document?.revision, sessionId, source],
  );

  return (
    <main className="min-h-screen bg-[#090d16] text-zinc-100">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#090d16]/95 px-4 py-3 backdrop-blur md:px-6">
        <div className="mx-auto flex max-w-[1800px] items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => router.push("/media/library" + (jobId ? "?highlight=" + encodeURIComponent(jobId) : ""))}
              className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-300 hover:bg-white/5"
            >
              <ArrowLeft className="h-4 w-4" />
              Library
            </button>
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-indigo-300">ShortForge Editor</div>
              <h1 className="truncate text-sm font-semibold md:text-base">
                {source?.job.title || "Loading Short…"}
              </h1>
              <p className="truncate text-[11px] text-zinc-500">
                {document ? "Revision " + document.revision + " · " : ""}{status}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => void runHistoryOperation("checkpoint")}
              disabled={!document || busy || loading}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs hover:bg-white/5 disabled:opacity-40"
              title="Save a named recovery checkpoint. Commands already create durable revisions."
            >
              <Save className="h-4 w-4" />
              Checkpoint
            </button>
            <button
              type="button"
              disabled
              title="Export is intentionally disabled until the server-side F06, Treasury, CAS asset-staging and F07 release context is wired and verified."
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-500/30 px-3 py-2 text-xs font-semibold text-indigo-200 opacity-60"
            >
              <Download className="h-4 w-4" />
              Export locked
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1800px] space-y-3 p-3 md:p-5">
        {source?.sourceKind === "FLATTENED_MP4" && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-400/25 bg-amber-400/10 p-3 text-sm text-amber-100">
            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <div className="font-semibold">Flattened source - clip-level editing only</div>
              <p className="mt-1 text-xs leading-5 text-amber-100/80">{source.sourceNotice}</p>
            </div>
          </div>
        )}

        {error && (
          <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-400/25 bg-red-400/10 p-3 text-sm text-red-200">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="flex min-h-[55vh] flex-col items-center justify-center gap-3 text-zinc-400">
            <LoaderCircle className="h-8 w-8 animate-spin text-indigo-300" />
            <p className="text-sm">{status}</p>
          </div>
        ) : document && actor && source ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.025] px-4 py-3">
              <div className="flex items-center gap-2 text-xs text-zinc-300">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                Source MP4 validated · {source.media.width}×{source.media.height} · {source.media.durationSeconds.toFixed(1)}s · SHA-256 {source.media.sha256.slice(0, 12)}…
              </div>
              {busy && <div className="text-xs text-indigo-200">Working…</div>}
            </div>
            <ShortForgeEditorStudio
              document={document}
              actor={actor}
              sessionId={sessionId}
              sourceVideoUrl={source.videoUrl}
              previewFrameUrl={previewFrameUrl || undefined}
              onCommand={applyCommand}
              onUndo={() => runHistoryOperation("undo")}
              onRedo={() => runHistoryOperation("redo")}
              onPreviewAt={previewAt}
              readOnly={busy}
            />
          </>
        ) : (
          <div className="mx-auto flex min-h-[45vh] max-w-xl flex-col items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white/[0.025] p-8 text-center">
            <CircleAlert className="h-8 w-8 text-amber-300" />
            <h2 className="text-lg font-semibold">This Short could not be opened</h2>
            <p className="text-sm text-zinc-400">{error || "The source is unavailable or does not meet the editor's media requirements."}</p>
            <button
              type="button"
              onClick={() => router.push("/media/library")}
              className="rounded-lg bg-white/10 px-4 py-2 text-sm hover:bg-white/15"
            >
              Back to Library
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
