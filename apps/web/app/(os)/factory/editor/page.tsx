"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ShortForgeEditorStudio from "@/components/editor/ShortForgeEditorStudio";
import type {
  CompositionIR,
  EditorCommandEnvelope,
  EditorDocument,
  EditorActor,
} from "@/factoryos/core/editor/EditorContracts";

function sessionKey(compositionId: string) {
  return `shortforge.editor.session.${compositionId}`;
}

function getSessionId(compositionId: string): string {
  if (typeof window === "undefined") return "";
  const key = sessionKey(compositionId);
  const existing = window.sessionStorage.getItem(key);
  if (existing) return existing;
  const next = globalThis.crypto?.randomUUID?.() ?? `editor-${Date.now()}`;
  window.sessionStorage.setItem(key, next);
  return next;
}

async function readJson(response: Response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error(payload.error || `EDITOR_API_${response.status}`);
  }
  return payload;
}

export default function EditorStudioPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const compositionId = searchParams.get("compositionId") || "";
  const sessionId = useMemo(
    () => (compositionId ? getSessionId(compositionId) : ""),
    [compositionId],
  );

  const [document, setDocument] = useState<EditorDocument | null>(null);
  const [actor, setActor] = useState<EditorActor | null>(null);
  const [jsonDraft, setJsonDraft] = useState("");
  const [loading, setLoading] = useState(Boolean(compositionId));
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("Ready");

  const load = useCallback(async () => {
    if (!compositionId || !sessionId) return;
    setLoading(true);
    setError(null);
    try {
      const payload = await readJson(
        await fetch(
          `/api/editor/runtime?compositionId=${encodeURIComponent(compositionId)}&sessionId=${encodeURIComponent(sessionId)}`,
          { cache: "no-store" },
        ),
      );
      setDocument(payload.document);
      setActor(payload.actor);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [compositionId, sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openComposition() {
    setError(null);
    setStatus("Opening composition…");
    try {
      const composition = JSON.parse(jsonDraft) as CompositionIR;
      if (!composition.compositionId) throw new Error("Composition must include compositionId.");
      const nextSessionId = getSessionId(composition.compositionId);
      await readJson(
        await fetch("/api/editor/runtime", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            operation: "open",
            sessionId: nextSessionId,
            composition,
          }),
        }),
      );
      router.replace(`/factory/editor?compositionId=${encodeURIComponent(composition.compositionId)}`);
      setStatus(`Opened ${composition.compositionId}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setStatus("Open failed");
    }
  }

  async function onCommand(input: EditorCommandEnvelope) {
    setError(null);
    const payload = await readJson(
      await fetch("/api/editor/runtime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation: "apply",
          sessionId: input.sessionId,
          commandId: input.commandId,
          expectedRevision: input.expectedRevision,
          command: input.command,
        }),
      }),
    );
    setStatus(
      payload.receipt?.accepted
        ? `Revision r${payload.receipt.revision} committed`
        : payload.receipt?.error || "Command rejected",
    );
    await load();
  }

  async function control(operation: "undo" | "redo") {
    setError(null);
    try {
      const payload = await readJson(
        await fetch("/api/editor/runtime", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ operation, sessionId }),
        }),
      );
      setStatus(
        payload.receipt?.accepted
          ? `${operation.toUpperCase()} → r${payload.receipt.revision}`
          : payload.receipt?.error || `${operation} rejected`,
      );
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function previewAt(seconds: number) {
    setError(null);
    try {
      const payload = await readJson(
        await fetch("/api/editor/runtime", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            operation: "preview",
            sessionId,
            timestampSeconds: seconds,
          }),
        }),
      );
      setPreviewUrl(`${payload.preview.previewUrl}?sha=${payload.preview.previewArtifactSha256}`);
      setStatus(`Physical preview @ ${seconds.toFixed(2)}s · ${payload.preview.previewArtifactSha256.slice(0, 12)}…`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  if (!compositionId) {
    return (
      <main className="mx-auto flex min-h-[calc(100vh-6rem)] max-w-6xl flex-col gap-6 p-6">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.25em] text-zinc-500">
            FactoryOS / Studio
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Open a CompositionIR</h1>
          <p className="mt-2 max-w-3xl text-sm text-zinc-500">
            Paste a canonical CompositionIR document to create or reopen a durable editor session.
            Editing remains command-based; the browser never becomes the document authority.
          </p>
        </div>

        <textarea
          value={jsonDraft}
          onChange={(event) => setJsonDraft(event.target.value)}
          placeholder={'{"compositionId":"...", "schemaVersion":"2.0.0", ...}'}
          className="min-h-[480px] rounded-2xl border border-zinc-800 bg-zinc-950 p-5 font-mono text-xs text-zinc-200 outline-none focus:border-indigo-500"
          spellCheck={false}
        />
        <button
          type="button"
          className="w-fit rounded-xl bg-indigo-500 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-400"
          onClick={() => void openComposition()}
        >
          Open in Studio
        </button>
        {error && (
          <div className="rounded-xl border border-red-900/60 bg-red-950/30 p-4 text-sm text-red-300">
            {error}
          </div>
        )}
        <div className="text-xs text-zinc-600">
          Status: {status}
        </div>
      </main>
    );
  }

  if (loading && !document) {
    return <main className="p-8 text-sm text-zinc-500">Loading durable editor session…</main>;
  }

  if (!document || !actor) {
    return (
      <main className="p-8">
        <div className="rounded-xl border border-red-900/60 bg-red-950/30 p-4 text-sm text-red-300">
          {error || "Composition session could not be loaded."}
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-[calc(100vh-4rem)] flex-col gap-3 p-3 lg:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.25em] text-zinc-500">
            FactoryOS / ShortForge Studio
          </div>
          <div className="mt-1 text-sm text-zinc-400">
            {status}
          </div>
        </div>
        {previewUrl && (
          <a
            href={previewUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-indigo-300 hover:text-indigo-200"
          >
            Open deterministic preview
          </a>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="min-h-0 flex-1">
        <ShortForgeEditorStudio
          document={document}
          actor={actor}
          sessionId={sessionId}
          onCommand={onCommand}
          onUndo={() => control("undo")}
          onRedo={() => control("redo")}
          onPreviewAt={previewAt}
          readOnly={false}
        />
      </div>

      {previewUrl && (
        <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
            Physical preview artifact
          </div>
          <div className="flex justify-center overflow-hidden rounded-xl bg-black">
            <img
              src={previewUrl}
              alt="ShortForge deterministic editor preview"
              className="max-h-[520px] w-auto object-contain"
            />
          </div>
        </section>
      )}
    </main>
  );
}
