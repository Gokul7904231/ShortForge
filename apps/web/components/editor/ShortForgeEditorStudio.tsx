"use client";

import React, { useMemo, useState } from "react";
import type {
  AnimationTrack,
  CompositionClip,
  CompositionIR,
  EditorCommand,
  EditorCommandEnvelope,
  EditorActor,
  EditorDocument,
  MediaTime,
} from "@/factoryos/core/editor/EditorContracts";

export interface ShortForgeEditorStudioProps {
  document: EditorDocument;
  actor: EditorActor;
  sessionId: string;
  onCommand: (command: EditorCommandEnvelope) => Promise<unknown> | unknown;
  onUndo?: () => Promise<unknown> | unknown;
  onRedo?: () => Promise<unknown> | unknown;
  onPreviewAt?: (seconds: number) => Promise<unknown> | unknown;
  readOnly?: boolean;
}

type InspectorField = "x" | "y" | "scaleX" | "scaleY" | "rotationDeg" | "opacity";

const SNAP_STEPS = [0.05, 0.1, 0.25, 0.5];
const MAX_TIMELINE_PX = 1200;

function secondsFromMediaTime(value: MediaTime): number {
  return value / 120_000;
}

function mediaTimeFromSeconds(seconds: number): MediaTime {
  return Math.max(0, Math.round(seconds * 120_000));
}

function nextCommandId() {
  return globalThis.crypto?.randomUUID?.() ?? `studio-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function clipLabel(clip: CompositionClip): string {
  return clip.metadata?.label
    ? String(clip.metadata.label)
    : clip.assetId || clip.id;
}

function clipColor(clip: CompositionClip): string {
  if (clip.kind === "VIDEO") return "bg-blue-500/75";
  if (clip.kind === "IMAGE") return "bg-violet-500/75";
  if (clip.kind === "TEXT") return "bg-amber-500/75";
  if (clip.kind === "MOTION_CANVAS") return "bg-emerald-500/75";
  return "bg-zinc-600/75";
}

function latestValue(track: AnimationTrack | undefined, fallback: number): number {
  return track?.keyframes?.length
    ? track.keyframes[track.keyframes.length - 1]!.value
    : fallback;
}

function buildEnvelope(
  sessionId: string,
  actor: EditorActor,
  expectedRevision: number,
  command: EditorCommand,
): EditorCommandEnvelope {
  return {
    commandId: nextCommandId(),
    sessionId,
    actor,
    expectedRevision,
    command,
  };
}

function snap(seconds: number, enabled: boolean, step: number): number {
  if (!enabled || step <= 0) return seconds;
  return Math.round(seconds / step) * step;
}

function formatTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const sec = Math.floor(safe % 60);
  const frames = Math.floor((safe - Math.floor(safe)) * 30);
  return `${String(minutes).padStart(2, "0")}:${String(sec).padStart(2, "0")}:${String(frames).padStart(2, "0")}`;
}

export function ShortForgeEditorStudio({
  document,
  actor,
  sessionId,
  onCommand,
  onUndo,
  onRedo,
  onPreviewAt,
  readOnly = false,
}: ShortForgeEditorStudioProps) {
  const composition = document.composition;
  const [selectedClipId, setSelectedClipId] = useState<string | null>(
    composition.tracks.flatMap((track) => track.clips)[0]?.id ?? null,
  );
  const [playheadSeconds, setPlayheadSeconds] = useState(0);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [snapStep, setSnapStep] = useState(0.1);
  const [draggingClipId, setDraggingClipId] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const selected = useMemo(
    () =>
      composition.tracks
        .flatMap((track) => track.clips)
        .find((clip) => clip.id === selectedClipId),
    [composition.tracks, selectedClipId],
  );

  const durationSeconds = secondsFromMediaTime(composition.canvas.duration);
  const timelineWidth = Math.min(MAX_TIMELINE_PX, Math.max(760, durationSeconds * 90));
  const pxPerSecond = timelineWidth / Math.max(0.001, durationSeconds);

  function emit(command: EditorCommand) {
    if (readOnly) return;
    return onCommand(buildEnvelope(sessionId, actor, document.revision, command));
  }

  async function preview(seconds: number) {
    const t = Math.max(0, Math.min(durationSeconds, seconds));
    setPlayheadSeconds(t);
    if (!onPreviewAt) return;
    setPreviewing(true);
    try {
      await onPreviewAt(t);
    } finally {
      setPreviewing(false);
    }
  }

  function setTransform(field: InspectorField, raw: string) {
    const value = Number(raw);
    if (!Number.isFinite(value) || !selected) return;
    const normalized = field === "opacity"
      ? Math.max(0, Math.min(1, value))
      : value;
    const trackId = composition.tracks.find((track) =>
      track.clips.some((clip) => clip.id === selected.id),
    )?.id;
    if (!trackId) return;
    void emit({
      type: "SET_CLIP_TRANSFORM",
      trackId,
      clipId: selected.id,
      transform: { [field]: normalized },
    });
  }

  function addKeyframe(property: AnimationTrack["property"]) {
    if (!selected) return;
    const trackId = composition.tracks.find((track) =>
      track.clips.some((clip) => clip.id === selected.id),
    )?.id;
    if (!trackId) return;
    const base =
      property === "opacity"
        ? selected.transform?.opacity ?? 1
        : property === "scaleX"
          ? selected.transform?.scaleX ?? 1
          : property === "scaleY"
            ? selected.transform?.scaleY ?? 1
            : property === "x"
              ? selected.transform?.x ?? 0
              : property === "y"
                ? selected.transform?.y ?? 0
                : selected.transform?.rotationDeg ?? 0;
    const existing = selected.animations?.find((track) => track.property === property);
    const keyframes = [
      ...(existing?.keyframes ?? []),
      {
        time: mediaTimeFromSeconds(playheadSeconds),
        value: base,
        interpolation: "LINEAR" as const,
      },
    ].sort((a, b) => a.time - b.time);

    const animations = [
      ...(selected.animations ?? []).filter((track) => track.property !== property),
      { property, keyframes },
    ];

    void emit({
      type: "SET_CLIP_ANIMATIONS",
      trackId,
      clipId: selected.id,
      animations,
    });
  }

  function addEffect(kind: string) {
    if (!selected) return;
    const trackId = composition.tracks.find((track) =>
      track.clips.some((clip) => clip.id === selected.id),
    )?.id;
    if (!trackId) return;
    void emit({
      type: "ADD_EFFECT",
      trackId,
      clipId: selected.id,
      effect: {
        effectId: `${kind.toLowerCase()}-${nextCommandId()}`,
        kind,
        scope: "CLIP",
        params:
          kind === "BLUR"
            ? { radius: 6 }
            : kind === "GRAYSCALE"
              ? { amount: 0.6 }
              : kind === "BRIGHTNESS"
                ? { amount: 1.15 }
                : { amount: 1 },
        enabled: true,
      },
    });
  }

  function addMask(kind: "RECTANGLE" | "ELLIPSE" | "DIAMOND") {
    if (!selected) return;
    const trackId = composition.tracks.find((track) =>
      track.clips.some((clip) => clip.id === selected.id),
    )?.id;
    if (!trackId) return;
    void emit({
      type: "ADD_MASK",
      trackId,
      clipId: selected.id,
      mask: {
        maskId: `${kind.toLowerCase()}-${nextCommandId()}`,
        kind,
        x: 80,
        y: 180,
        width: composition.canvas.width - 160,
        height: composition.canvas.height - 360,
        rotationDeg: 0,
        feather: 8,
      },
    });
  }

  function setTransition(kind: string) {
    if (!selected) return;
    const trackId = composition.tracks.find((track) =>
      track.clips.some((clip) => clip.id === selected.id),
    )?.id;
    if (!trackId) return;
    void emit({
      type: "SET_TRANSITION",
      trackId,
      clipId: selected.id,
      edge: "IN",
      transition: {
        transitionId: `transition-${nextCommandId()}`,
        kind,
        duration: mediaTimeFromSeconds(0.5),
      },
    });
  }

  function moveClipFromPointer(clip: CompositionClip, event: React.PointerEvent<HTMLDivElement>) {
    if (readOnly) return;
    const rect = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!rect) return;
    const localX = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
    const target = snap(localX / pxPerSecond, snapEnabled, snapStep);
    const trackId = composition.tracks.find((track) =>
      track.clips.some((item) => item.id === clip.id),
    )?.id;
    if (!trackId) return;
    void emit({
      type: "MOVE_CLIP",
      trackId,
      clipId: clip.id,
      start: mediaTimeFromSeconds(Math.max(0, target)),
    });
  }

  const transformValues: Record<InspectorField, number> = {
    x: selected?.transform?.x ?? 0,
    y: selected?.transform?.y ?? 0,
    scaleX: selected?.transform?.scaleX ?? 1,
    scaleY: selected?.transform?.scaleY ?? 1,
    rotationDeg: selected?.transform?.rotationDeg ?? 0,
    opacity: selected?.transform?.opacity ?? 1,
  };

  return (
    <div className="flex h-full min-h-[720px] min-w-0 flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 text-zinc-100 shadow-2xl">
      <header className="flex items-center justify-between gap-4 border-b border-zinc-800 px-4 py-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-500">
            ShortForge Studio
          </div>
          <div className="truncate text-sm font-medium">
            {composition.metadata.missionId} · r{document.revision}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs hover:bg-zinc-900 disabled:opacity-50"
            onClick={() => void onUndo?.()}
            disabled={readOnly || !onUndo}
          >
            Undo
          </button>
          <button
            type="button"
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs hover:bg-zinc-900 disabled:opacity-50"
            onClick={() => void onRedo?.()}
            disabled={readOnly || !onRedo}
          >
            Redo
          </button>
          <button
            type="button"
            className="rounded-lg bg-indigo-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-400 disabled:opacity-50"
            onClick={() => void preview(playheadSeconds)}
            disabled={!onPreviewAt || previewing}
          >
            {previewing ? "Previewing…" : "Preview"}
          </button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_300px]">
        <main className="flex min-w-0 flex-col">
          <section className="grid min-h-[380px] min-w-0 grid-cols-[minmax(0,1fr)_210px] border-b border-zinc-800">
            <div className="relative flex items-center justify-center overflow-hidden bg-zinc-900">
              <div
                className="relative aspect-[9/16] max-h-[92%] w-auto rounded-xl border border-zinc-700 bg-black shadow-xl"
                style={{
                  background:
                    composition.canvas.background?.kind === "SOLID"
                      ? String(composition.canvas.background.value)
                      : undefined,
                }}
              >
                <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-zinc-500">
                  {selected ? clipLabel(selected) : "Select a clip"}
                </div>
                <div className="absolute inset-x-0 bottom-3 text-center text-[10px] text-zinc-600">
                  {formatTime(playheadSeconds)}
                </div>
              </div>
            </div>

            <aside className="overflow-auto border-l border-zinc-800 bg-zinc-950 p-4">
              <div className="mb-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Inspector
              </div>
              {selected ? (
                <div className="space-y-4">
                  <div>
                    <div className="text-xs font-medium">{clipLabel(selected)}</div>
                    <div className="mt-1 text-[10px] text-zinc-500">
                      {selected.kind} · {secondsFromMediaTime(selected.duration).toFixed(2)}s
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {(Object.keys(transformValues) as InspectorField[]).map((field) => (
                      <label key={field} className="space-y-1">
                        <span className="text-[10px] uppercase tracking-wider text-zinc-500">
                          {field}
                        </span>
                        <input
                          type="number"
                          step={field === "opacity" ? 0.05 : 1}
                          min={field === "opacity" ? 0 : undefined}
                          max={field === "opacity" ? 1 : undefined}
                          value={transformValues[field]}
                          disabled={readOnly}
                          onChange={(event) => setTransform(field, event.target.value)}
                          className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-xs outline-none focus:border-indigo-500"
                        />
                      </label>
                    ))}
                  </div>

                  <div>
                    <div className="mb-2 text-[10px] uppercase tracking-wider text-zinc-500">
                      Keyframes
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {(["x", "y", "scaleX", "scaleY", "rotationDeg", "opacity"] as const).map((property) => (
                        <button
                          key={property}
                          type="button"
                          className="rounded-md border border-zinc-800 px-2 py-1.5 text-[10px] hover:bg-zinc-900 disabled:opacity-50"
                          disabled={readOnly}
                          onClick={() => addKeyframe(property)}
                        >
                          + {property}
                        </button>
                      ))}
                    </div>
                    <div className="mt-2 space-y-1">
                      {selected.animations?.map((track) => (
                        <div key={track.property} className="rounded-md bg-zinc-900 px-2 py-1.5 text-[10px]">
                          <div className="font-medium">{track.property}</div>
                          <div className="text-zinc-500">{track.keyframes.length} keyframes</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 text-[10px] uppercase tracking-wider text-zinc-500">
                      Effects
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {["BRIGHTNESS", "BLUR", "GRAYSCALE", "CONTRAST"].map((kind) => (
                        <button
                          key={kind}
                          type="button"
                          className="rounded-md border border-zinc-800 px-2 py-1.5 text-[10px] hover:bg-zinc-900 disabled:opacity-50"
                          disabled={readOnly}
                          onClick={() => addEffect(kind)}
                        >
                          {kind}
                        </button>
                      ))}
                    </div>
                    <div className="mt-2 text-[10px] text-zinc-500">
                      {selected.effects?.length ?? 0} effect nodes
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 text-[10px] uppercase tracking-wider text-zinc-500">
                      Masks / transition
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {(["RECTANGLE", "ELLIPSE", "DIAMOND"] as const).map((kind) => (
                        <button
                          key={kind}
                          type="button"
                          className="rounded-md border border-zinc-800 px-2 py-1.5 text-[10px] hover:bg-zinc-900 disabled:opacity-50"
                          disabled={readOnly}
                          onClick={() => addMask(kind)}
                        >
                          {kind}
                        </button>
                      ))}
                      <button
                        type="button"
                        className="rounded-md border border-zinc-800 px-2 py-1.5 text-[10px] hover:bg-zinc-900 disabled:opacity-50"
                        disabled={readOnly}
                        onClick={() => setTransition("FADE")}
                      >
                        FADE IN
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-zinc-800 px-2 py-1.5 text-[10px] hover:bg-zinc-900 disabled:opacity-50"
                        disabled={readOnly}
                        onClick={() => setTransition("SLIDE_LEFT")}
                      >
                        SLIDE IN
                      </button>
                    </div>
                    <div className="mt-2 text-[10px] text-zinc-500">
                      {selected.masks?.length ?? 0} masks · {selected.transitionIn ? "transition set" : "no transition"}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-zinc-600">
                  Select a clip to inspect transforms, keyframes, effects, masks, and transitions.
                </div>
              )}
            </aside>
          </section>

          <section className="min-h-0 flex-1 overflow-auto bg-zinc-950">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-800 bg-zinc-950/95 px-4 py-2 backdrop-blur">
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wider text-zinc-500">Timeline</span>
                <button
                  type="button"
                  className={`rounded-md border px-2 py-1 text-[10px] ${snapEnabled ? "border-indigo-500 text-indigo-300" : "border-zinc-800 text-zinc-500"}`}
                  onClick={() => setSnapEnabled((value) => !value)}
                >
                  Snap
                </button>
                <select
                  value={snapStep}
                  onChange={(event) => setSnapStep(Number(event.target.value))}
                  className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 text-[10px]"
                >
                  {SNAP_STEPS.map((step) => (
                    <option key={step} value={step}>{step}s</option>
                  ))}
                </select>
              </div>
              <div className="font-mono text-[10px] text-zinc-500">
                {formatTime(playheadSeconds)} / {formatTime(durationSeconds)}
              </div>
            </div>

            <div className="min-w-max p-4">
              <div
                className="relative mb-2 h-6 rounded-md border border-zinc-900 bg-zinc-900/60"
                style={{ width: timelineWidth }}
                onPointerDown={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  void preview((event.clientX - rect.left) / pxPerSecond);
                }}
              >
                {Array.from({ length: Math.ceil(durationSeconds) + 1 }).map((_, second) => (
                  <div
                    key={second}
                    className="absolute top-0 h-full border-l border-zinc-800"
                    style={{ left: second * pxPerSecond }}
                  >
                    <span className="ml-1 text-[9px] text-zinc-600">{second}s</span>
                  </div>
                ))}
                <div
                  className="pointer-events-none absolute top-0 h-full w-px bg-red-400"
                  style={{ left: playheadSeconds * pxPerSecond }}
                />
              </div>

              <div className="space-y-2">
                {composition.tracks.map((track) => (
                  <div key={track.id} className="grid grid-cols-[112px_minmax(0,1fr)] gap-3">
                    <div className="flex items-center rounded-md border border-zinc-800 bg-zinc-900 px-2 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                      {track.kind.replace("AUDIO_", "AUDIO ")}
                    </div>
                    <div
                      className="relative h-14 rounded-md border border-zinc-900 bg-zinc-900/40"
                      style={{ width: timelineWidth }}
                    >
                      {track.clips.map((clip) => {
                        const start = secondsFromMediaTime(clip.start);
                        const width = Math.max(24, secondsFromMediaTime(clip.duration) * pxPerSecond);
                        return (
                          <div
                            key={clip.id}
                            className={`absolute top-1 h-12 cursor-pointer overflow-hidden rounded-lg border px-2 py-1 shadow-lg ${clipColor(clip)} ${selectedClipId === clip.id ? "border-white ring-2 ring-white/30" : "border-white/10"}`}
                            style={{ left: start * pxPerSecond, width }}
                            onPointerDown={(event) => {
                              event.stopPropagation();
                              setSelectedClipId(clip.id);
                              setDraggingClipId(clip.id);
                            }}
                            onPointerUp={(event) => {
                              event.stopPropagation();
                              if (draggingClipId === clip.id) {
                                moveClipFromPointer(clip, event);
                              }
                              setDraggingClipId(null);
                            }}
                          >
                            <div className="truncate text-[10px] font-semibold">{clipLabel(clip)}</div>
                            <div className="truncate text-[9px] text-white/70">
                              {secondsFromMediaTime(clip.duration).toFixed(2)}s
                              {clip.effects?.length ? ` · ${clip.effects.length} fx` : ""}
                              {clip.masks?.length ? ` · ${clip.masks.length} mask` : ""}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </main>

        <aside className="hidden border-l border-zinc-800 bg-zinc-950/95 p-4 lg:block">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
            Composition
          </div>
          <div className="mt-3 space-y-3 text-xs">
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
              <div className="text-zinc-500">Canvas</div>
              <div className="mt-1 font-mono">{composition.canvas.width}×{composition.canvas.height}</div>
              <div className="mt-1 font-mono text-zinc-500">
                {composition.canvas.frameRate.numerator}/{composition.canvas.frameRate.denominator} fps
              </div>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
              <div className="text-zinc-500">Background</div>
              <div className="mt-1">
                {composition.canvas.background?.kind ?? "DEFAULT"}
              </div>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
              <div className="text-zinc-500">Audio</div>
              <div className="mt-1">{composition.audio.length} tracks</div>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
              <div className="text-zinc-500">Captions</div>
              <div className="mt-1">{composition.captions.length} cues</div>
            </div>
          </div>

          {!readOnly && (
            <div className="mt-5">
              <div className="mb-2 text-[10px] uppercase tracking-wider text-zinc-500">
                Preview Controls
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[0, durationSeconds / 2, Math.max(0, durationSeconds - 1 / Math.max(1, composition.canvas.frameRate.numerator))].map((t) => (
                  <button
                    key={t}
                    type="button"
                    className="rounded-md border border-zinc-800 px-2 py-1.5 text-[10px] hover:bg-zinc-900"
                    onClick={() => void preview(t)}
                  >
                    {formatTime(t)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

export default ShortForgeEditorStudio;
