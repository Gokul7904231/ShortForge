"use client";

import React, { useEffect, useMemo, useState } from "react";
import type {
  EditorCommand,
  EditorCommandEnvelope,
  EditorActor,
  EditorDocument,
} from "@/factoryos/core/editor/EditorContracts";
import type {
  AnimationTrack as CompositionAnimationTrack,
  CompositionClip,
  CompositionCaption,
  MediaTime,
} from "@/factoryos/core/timeline/CompositionIR";

export interface ShortForgeEditorStudioProps {
  document: EditorDocument;
  actor: EditorActor;
  sessionId: string;
  onCommand: (command: EditorCommandEnvelope) => Promise<unknown> | unknown;
  onUndo?: () => Promise<unknown> | unknown;
  onRedo?: () => Promise<unknown> | unknown;
  onPreviewAt?: (seconds: number) => Promise<unknown> | unknown;
  /** Verified source MP4 used until the source project contains semantic scene layers. */
  sourceVideoUrl?: string;
  /** Physically rendered frame from the canonical editor preview endpoint. */
  previewFrameUrl?: string;
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
  const label = clip.metadata?.label;
  if (typeof label === "string" && label.trim()) return label;
  const sceneLabel = clip.metadata?.sceneLabel;
  if (typeof sceneLabel === "string" && sceneLabel.trim()) return sceneLabel;
  const sceneId = clip.metadata?.sceneId;
  if (typeof sceneId === "string" && sceneId.trim()) return "Scene " + sceneId;
  return clip.assetId || clip.id;
}

function clipColor(clip: CompositionClip): string {
  if (clip.kind === "VIDEO") return "bg-blue-500/75";
  if (clip.kind === "IMAGE") return "bg-violet-500/75";
  if (clip.kind === "TEXT") return "bg-amber-500/75";
  if (clip.kind === "MOTION_CANVAS") return "bg-emerald-500/75";
  return "bg-zinc-600/75";
}

function latestValue(track: CompositionAnimationTrack | undefined, fallback: number): number {
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
  sourceVideoUrl,
  previewFrameUrl,
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
  const [selectedCaptionId, setSelectedCaptionId] = useState<string | null>(
    composition.captions[0]?.id ?? null,
  );
  const [captionDraft, setCaptionDraft] = useState(composition.captions[0]?.text ?? "");
  const [captionFontSizeDraft, setCaptionFontSizeDraft] = useState(
    composition.captions[0]?.style.fontSize ?? 42,
  );
  const [captionColorDraft, setCaptionColorDraft] = useState(
    composition.captions[0]?.style.primaryColor ?? "#FFFFFF",
  );
  const [captionAnimationDraft, setCaptionAnimationDraft] = useState<CompositionCaption["style"]["animation"]>(
    composition.captions[0]?.style.animation ?? "NONE",
  );
  const initialClip = composition.tracks.flatMap((track) => track.clips)[0];
  const [clipStartDraft, setClipStartDraft] = useState(
    secondsFromMediaTime(initialClip?.start ?? 0).toFixed(2),
  );
  const [clipEndDraft, setClipEndDraft] = useState(
    secondsFromMediaTime((initialClip?.start ?? 0) + (initialClip?.duration ?? 0)).toFixed(2),
  );

  const selected = useMemo(
    () =>
      composition.tracks
        .flatMap((track) => track.clips)
        .find((clip) => clip.id === selectedClipId),
    [composition.tracks, selectedClipId],
  );
  const selectedCaption = useMemo(
    () => composition.captions.find((caption) => caption.id === selectedCaptionId),
    [composition.captions, selectedCaptionId],
  );

  useEffect(() => {
    setCaptionDraft(selectedCaption?.text ?? "");
    setCaptionFontSizeDraft(selectedCaption?.style.fontSize ?? 42);
    setCaptionColorDraft(selectedCaption?.style.primaryColor ?? "#FFFFFF");
    setCaptionAnimationDraft(selectedCaption?.style.animation ?? "NONE");
  }, [
    selectedCaption?.id,
    selectedCaption?.text,
    selectedCaption?.style.fontSize,
    selectedCaption?.style.primaryColor,
    selectedCaption?.style.animation,
  ]);

  useEffect(() => {
    setClipStartDraft(secondsFromMediaTime(selected?.start ?? 0).toFixed(2));
    setClipEndDraft(
      secondsFromMediaTime((selected?.start ?? 0) + (selected?.duration ?? 0)).toFixed(2),
    );
  }, [selected?.id, selected?.start, selected?.duration]);

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

  function addKeyframe(property: CompositionAnimationTrack["property"]) {
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
    const nextTime = mediaTimeFromSeconds(playheadSeconds);
    const nextKeyframe = {
      time: nextTime,
      value: base,
      interpolation: "LINEAR" as const,
    };
    const keyframes = [
      ...(existing?.keyframes ?? []).filter((frame) => frame.time !== nextTime),
      nextKeyframe,
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

  async function saveSelectedClipRange() {
    if (readOnly || !selected) return;
    const startSeconds = Number(clipStartDraft);
    const endSeconds = Number(clipEndDraft);
    if (
      !Number.isFinite(startSeconds) || !Number.isFinite(endSeconds) ||
      startSeconds < 0 || endSeconds <= startSeconds || endSeconds > durationSeconds
    ) return;
    const trackId = composition.tracks.find((track) => track.clips.some((clip) => clip.id === selected.id))?.id;
    if (!trackId) return;
    const result = await emit({
      type: "TRIM_CLIP",
      trackId,
      clipId: selected.id,
      start: mediaTimeFromSeconds(startSeconds),
      end: mediaTimeFromSeconds(endSeconds),
    });
    if (result && typeof result === "object" && "success" in result && (result as { success?: boolean }).success) {
      setPlayheadSeconds(startSeconds);
    }
  }

  async function splitSelectedAtPlayhead() {
    if (readOnly || !selected) return;
    const splitTime = mediaTimeFromSeconds(playheadSeconds);
    if (splitTime <= selected.start || splitTime >= selected.start + selected.duration) return;
    const trackId = composition.tracks.find((track) => track.clips.some((clip) => clip.id === selected.id))?.id;
    if (!trackId) return;
    const result = await emit({
      type: "SPLIT_CLIP",
      trackId,
      clipId: selected.id,
      splitTime,
    });
    if (result && typeof result === "object" && "success" in result && (result as { success?: boolean }).success) {
      setSelectedClipId(selected.id + ":a");
    }
  }

  function saveCaptionText() {
    if (readOnly || !selectedCaption || !captionDraft.trim() || captionDraft === selectedCaption.text) return;
    void emit({
      type: "UPDATE_CAPTION_TEXT",
      captionId: selectedCaption.id,
      text: captionDraft,
    });
  }

  function selectCaption(captionId: string) {
    setSelectedCaptionId(captionId);
    const caption = composition.captions.find((item) => item.id === captionId);
    setCaptionDraft(caption?.text ?? "");
  }

  function saveCaptionStyle() {
    if (!selectedCaption) return;
    const fontSize = Number(captionFontSizeDraft);
    if (!Number.isFinite(fontSize) || fontSize < 8 || fontSize > 144) return;
    if (!/^#[0-9a-f]{6}$/i.test(captionColorDraft)) return;
    if (
      fontSize === selectedCaption.style.fontSize &&
      captionColorDraft.toUpperCase() === selectedCaption.style.primaryColor.toUpperCase() &&
      captionAnimationDraft === selectedCaption.style.animation
    ) return;
    void emit({
      type: "UPDATE_CAPTION_STYLE",
      captionId: selectedCaption.id,
      stylePatch: {
        fontSize,
        primaryColor: captionColorDraft.toUpperCase(),
        animation: captionAnimationDraft,
      },
    });
  }

  function setBackground(kind: "SOLID" | "GRADIENT" | "BLUR") {
    if (readOnly) return;
    void emit({
      type: "SET_CANVAS_BACKGROUND",
      background:
        kind === "SOLID"
          ? { kind, value: "#0f172a" }
          : kind === "GRADIENT"
            ? { kind, value: { start: "#0b1020", end: "#3b1d72", direction: "VERTICAL" } }
            : { kind, value: "#111827" },
    });
  }

  function setTransition(kind: string, edge: "IN" | "OUT" = "IN") {
    if (!selected) return;
    const trackId = composition.tracks.find((track) =>
      track.clips.some((clip) => clip.id === selected.id),
    )?.id;
    if (!trackId) return;
    void emit({
      type: "SET_TRANSITION",
      trackId,
      clipId: selected.id,
      edge,
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
                className="relative aspect-[9/16] h-[min(72vh,760px)] max-h-[92%] max-w-full overflow-hidden rounded-xl border border-zinc-700 bg-black shadow-xl"
                style={{
                  background:
                    composition.canvas.background?.kind === "SOLID"
                      ? String(composition.canvas.background.value)
                      : undefined,
                }}
              >
                {previewFrameUrl ? (
                  <img
                    src={previewFrameUrl}
                    alt="Rendered ShortForge editor preview frame"
                    className="absolute inset-0 h-full w-full object-contain"
                  />
                ) : sourceVideoUrl ? (
                  <video
                    key={sourceVideoUrl}
                    src={sourceVideoUrl}
                    controls
                    playsInline
                    preload="metadata"
                    className="absolute inset-0 h-full w-full bg-black object-contain"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-zinc-500">
                    {selected ? clipLabel(selected) : "Select a clip"}
                  </div>
                )}
                <div className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-[10px] text-white/75 drop-shadow">
                  {formatTime(playheadSeconds)}
                </div>
              </div>
            </div>

            <aside className="overflow-auto border-l border-zinc-800 bg-zinc-950 p-4">
              <div className="mb-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Inspector
              </div>
              <section className="mb-4 border-b border-zinc-800 pb-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Scenes / Clips</div>
                  <div className="text-[10px] text-zinc-600">{composition.tracks.reduce((count, track) => count + track.clips.length, 0)}</div>
                </div>
                <div className="max-h-36 space-y-1 overflow-auto pr-1">
                  {composition.tracks.flatMap((track) => track.clips.map((clip) => ({ track, clip }))).map(({ track, clip }) => (
                    <button
                      key={clip.id}
                      type="button"
                      onClick={() => {
                        setSelectedClipId(clip.id);
                        void preview(secondsFromMediaTime(clip.start));
                      }}
                      disabled={readOnly && !onPreviewAt}
                      className={
                        "flex w-full items-center justify-between gap-2 rounded-md border px-2 py-2 text-left text-[10px] " +
                        (selectedClipId === clip.id
                          ? "border-indigo-500/70 bg-indigo-500/10 text-indigo-100"
                          : "border-zinc-800 bg-zinc-900/40 text-zinc-300 hover:bg-zinc-900")
                      }
                    >
                      <span className="min-w-0 truncate">{clipLabel(clip)}</span>
                      <span className="shrink-0 text-zinc-500">{secondsFromMediaTime(clip.duration).toFixed(1)}s</span>
                    </button>
                  ))}
                </div>
              </section>
              {selected ? (
                <div className="space-y-4">
                  <div>
                    <div className="text-xs font-medium">{clipLabel(selected)}</div>
                    <div className="mt-1 text-[10px] text-zinc-500">
                      {selected.kind} · {secondsFromMediaTime(selected.duration).toFixed(2)}s
                    </div>
                  </div>

                  <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
                    <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Trim / position</div>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="space-y-1 text-[10px] text-zinc-500">
                        Timeline start (s)
                        <input
                          type="number"
                          min={0}
                          max={durationSeconds}
                          step={0.05}
                          value={clipStartDraft}
                          disabled={readOnly}
                          onChange={(event) => setClipStartDraft(event.target.value)}
                          className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-100 disabled:opacity-50"
                        />
                      </label>
                      <label className="space-y-1 text-[10px] text-zinc-500">
                        Timeline end (s)
                        <input
                          type="number"
                          min={0}
                          max={durationSeconds}
                          step={0.05}
                          value={clipEndDraft}
                          disabled={readOnly}
                          onChange={(event) => setClipEndDraft(event.target.value)}
                          className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-100 disabled:opacity-50"
                        />
                      </label>
                    </div>
                    <button
                      type="button"
                      onClick={() => void saveSelectedClipRange()}
                      disabled={readOnly || !clipStartDraft.trim() || !clipEndDraft.trim() || Number(clipEndDraft) <= Number(clipStartDraft)}
                      className="mt-2 w-full rounded-md border border-zinc-700 px-2 py-2 text-[10px] font-semibold text-zinc-200 hover:bg-zinc-900 disabled:opacity-40"
                    >
                      Apply trim
                    </button>
                    <button
                      type="button"
                      onClick={() => void splitSelectedAtPlayhead()}
                      disabled={readOnly || playheadSeconds <= secondsFromMediaTime(selected.start) || playheadSeconds >= secondsFromMediaTime(selected.start + selected.duration)}
                      className="mt-2 w-full rounded-md bg-indigo-500/15 px-2 py-2 text-[10px] font-semibold text-indigo-200 hover:bg-indigo-500/25 disabled:opacity-40"
                    >
                      Split at playhead
                    </button>
                  </section>

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
                      Canvas background
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {(["SOLID", "GRADIENT", "BLUR"] as const).map((kind) => (
                        <button
                          key={kind}
                          type="button"
                          className="rounded-md border border-zinc-800 px-2 py-1.5 text-[10px] hover:bg-zinc-900 disabled:opacity-50"
                          disabled={readOnly}
                          onClick={() => setBackground(kind)}
                        >
                          {kind}
                        </button>
                      ))}
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
                        onClick={() => setTransition("SLIDE_LEFT", "IN")}
                      >
                        SLIDE IN
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-zinc-800 px-2 py-1.5 text-[10px] hover:bg-zinc-900 disabled:opacity-50"
                        disabled={readOnly}
                        onClick={() => setTransition("FADE", "OUT")}
                      >
                        FADE OUT
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

              {composition.audio.map((audio) => (
                <div key={audio.id} className="grid grid-cols-[112px_minmax(0,1fr)] gap-3">
                  <div className="flex items-center rounded-md border border-zinc-800 bg-zinc-900 px-2 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                    AUDIO {audio.kind}
                  </div>
                  <div
                    className="relative h-10 rounded-md border border-zinc-900 bg-zinc-900/30"
                    style={{ width: timelineWidth }}
                  >
                    <div
                      className="absolute top-1 h-8 rounded-md border border-emerald-400/20 bg-emerald-500/20 px-2 py-1"
                      style={{
                        left: secondsFromMediaTime(audio.start) * pxPerSecond,
                        width: Math.max(24, secondsFromMediaTime(audio.duration) * pxPerSecond),
                      }}
                    >
                      <div className="truncate text-[9px] font-medium text-emerald-200">
                        {audio.id} · {audio.playbackRate ?? 1}×
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {composition.captions.length > 0 && (
                <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-3">
                  <div className="flex items-center rounded-md border border-zinc-800 bg-zinc-900 px-2 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                    CAPTIONS
                  </div>
                  <div
                    className="relative h-10 rounded-md border border-zinc-900 bg-zinc-900/30"
                    style={{ width: timelineWidth }}
                  >
                    {composition.captions.map((caption) => (
                      <div
                        key={caption.id}
                        className="absolute top-1 h-8 overflow-hidden rounded-md border border-amber-400/20 bg-amber-500/20 px-2 py-1 text-[9px] text-amber-100"
                        style={{
                          left: secondsFromMediaTime(caption.start) * pxPerSecond,
                          width: Math.max(
                            24,
                            secondsFromMediaTime(caption.end - caption.start) * pxPerSecond,
                          ),
                        }}
                      >
                        {caption.text}
                      </div>
                    ))}
                  </div>
                </div>
              )}
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

          <section className="mt-5 rounded-xl border border-zinc-800 bg-zinc-900/50 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Caption Editor
            </div>
            {composition.captions.length > 0 && selectedCaption ? (
              <div className="mt-3 space-y-2">
                {composition.captions.length > 1 && (
                  <select
                    value={selectedCaption.id}
                    onChange={(event) => selectCaption(event.target.value)}
                    disabled={readOnly}
                    aria-label="Caption cue"
                    className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-2 text-xs text-zinc-200 disabled:opacity-50"
                  >
                    {composition.captions.map((caption) => (
                      <option key={caption.id} value={caption.id}>
                        {formatTime(secondsFromMediaTime(caption.start))} · {caption.text.slice(0, 44)}
                      </option>
                    ))}
                  </select>
                )}
                <div className="text-[10px] text-zinc-500">
                  {formatTime(secondsFromMediaTime(selectedCaption.start))}–{formatTime(secondsFromMediaTime(selectedCaption.end))}
                </div>
                <textarea
                  value={captionDraft}
                  onChange={(event) => setCaptionDraft(event.target.value)}
                  disabled={readOnly}
                  rows={4}
                  maxLength={500}
                  aria-label="Caption text"
                  className="w-full resize-y rounded-md border border-zinc-700 bg-zinc-950 p-2 text-xs leading-5 text-zinc-100 outline-none focus:border-indigo-400 disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={saveCaptionText}
                  disabled={readOnly || !captionDraft.trim() || captionDraft === selectedCaption.text}
                  className="w-full rounded-md bg-indigo-500 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Apply caption text
                </button>

                <div className="grid grid-cols-[1fr_76px] gap-2 pt-2">
                  <label className="text-[10px] text-zinc-400">
                    Font size
                    <input
                      type="number"
                      min={8}
                      max={144}
                      value={captionFontSizeDraft}
                      onChange={(event) => setCaptionFontSizeDraft(Number(event.target.value))}
                      disabled={readOnly}
                      className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-2 text-xs text-zinc-100 disabled:opacity-50"
                    />
                  </label>
                  <label className="text-[10px] text-zinc-400">
                    Text colour
                    <input
                      type="color"
                      value={/^#[0-9a-f]{6}$/i.test(captionColorDraft) ? captionColorDraft : "#FFFFFF"}
                      onChange={(event) => setCaptionColorDraft(event.target.value.toUpperCase())}
                      disabled={readOnly}
                      className="mt-1 h-[34px] w-full rounded-md border border-zinc-700 bg-zinc-950 p-1 disabled:opacity-50"
                    />
                  </label>
                </div>
                <label className="block pt-1 text-[10px] text-zinc-400">
                  Animation
                  <select
                    value={captionAnimationDraft}
                    onChange={(event) => setCaptionAnimationDraft(event.target.value as CompositionCaption["style"]["animation"])}
                    disabled={readOnly}
                    className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-2 py-2 text-xs text-zinc-200 disabled:opacity-50"
                  >
                    <option value="NONE">None</option>
                    <option value="POP_IN">Pop in</option>
                    <option value="FADE">Fade</option>
                    <option value="KINETIC_WORD">Kinetic word</option>
                  </select>
                </label>
                <button
                  type="button"
                  onClick={saveCaptionStyle}
                  disabled={
                    readOnly ||
                    !Number.isFinite(Number(captionFontSizeDraft)) ||
                    Number(captionFontSizeDraft) < 8 ||
                    Number(captionFontSizeDraft) > 144 ||
                    !/^#[0-9a-f]{6}$/i.test(captionColorDraft) ||
                    (Number(captionFontSizeDraft) === selectedCaption.style.fontSize &&
                      captionColorDraft.toUpperCase() === selectedCaption.style.primaryColor.toUpperCase() &&
                      captionAnimationDraft === selectedCaption.style.animation)
                  }
                  className="w-full rounded-md border border-zinc-700 px-3 py-2 text-xs font-semibold text-zinc-200 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Apply caption style
                </button>
                <p className="text-[10px] leading-4 text-zinc-500">
                  Text and style changes create new revisions. Use Preview to render the updated frame.
                </p>
              </div>
            ) : (
              <p className="mt-2 text-[11px] leading-5 text-zinc-500">
                This source has no independent caption cues. Legacy flattened videos cannot be edited at the caption layer; reopen a source-composition project when available.
              </p>
            )}
          </section>

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
