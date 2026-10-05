import type {
  AnimationTrack,
  CompositionAudioClip,
  CompositionCaption,
  CompositionClip,
  CompositionIR,
  CompositionTrack,
  CompositionWordCue,
  MediaTime,
  RippleScope,
} from "./CompositionIR";

export interface RippleDeleteOptions {
  readonly scope?: RippleScope;
  readonly linkedTrackIds?: readonly string[];
  readonly includeAudio?: boolean;
  readonly includeCaptions?: boolean;
}

function cloneTrack(track: CompositionTrack, clips: readonly CompositionClip[]): CompositionTrack {
  return { ...track, clips };
}

function assertClipExists(track: CompositionTrack, clipId: string): CompositionClip {
  const clip = track.clips.find((item) => item.id === clipId);
  if (!clip) throw new Error(`Unknown clip: ${clipId}`);
  return clip;
}

function replaceClip(
  composition: CompositionIR,
  trackId: string,
  clipId: string,
  replacement: CompositionClip,
): CompositionIR {
  let found = false;
  const tracks = composition.tracks.map((track) => {
    if (track.id !== trackId) return track;
    return cloneTrack(track, track.clips.map((clip) => {
      if (clip.id !== clipId) return clip;
      found = true;
      return replacement;
    }));
  });
  if (!found) throw new Error(`Unknown clip: ${clipId}`);
  return { ...composition, tracks };
}

function remapAnimations(
  animations: readonly AnimationTrack[] | undefined,
  mapper: (time: MediaTime) => MediaTime,
  keep?: (time: MediaTime) => boolean,
): readonly AnimationTrack[] | undefined {
  if (!animations) return undefined;
  const mapped = animations
    .map((animation) => ({
      ...animation,
      keyframes: animation.keyframes
        .filter((frame) => keep ? keep(frame.time) : true)
        .map((frame) => ({ ...frame, time: mapper(frame.time) })),
    }))
    .filter((animation) => animation.keyframes.length > 0);
  return mapped;
}

function remapClipAnimations(
  clip: CompositionClip,
  mapper: (time: MediaTime) => MediaTime,
  keep?: (time: MediaTime) => boolean,
): CompositionClip {
  return {
    ...clip,
    animations: remapAnimations(clip.animations, mapper, keep),
    effects: clip.effects?.map((effect) => ({
      ...effect,
      animations: remapAnimations(effect.animations, mapper, keep),
    })),
    masks: clip.masks?.map((mask) => ({
      ...mask,
      animations: remapAnimations(mask.animations, mapper, keep),
    })),
  };
}

function shiftClip(clip: CompositionClip, delta: MediaTime): CompositionClip {
  if (delta === 0) return clip;
  return remapClipAnimations(clip, (time) => time + delta);
}

function scaleClipTiming(
  clip: CompositionClip,
  oldStart: MediaTime,
  oldDuration: MediaTime,
  newDuration: MediaTime,
): CompositionClip {
  const scale = newDuration / oldDuration;
  return remapClipAnimations(
    clip,
    (time) => oldStart + Math.round((time - oldStart) * scale),
    (time) => time >= oldStart && time <= oldStart + oldDuration,
  );
}

function shiftAudio(audio: CompositionAudioClip, delta: MediaTime): CompositionAudioClip {
  return { ...audio, start: audio.start + delta };
}

function shiftWordCue(cue: CompositionWordCue, delta: MediaTime): CompositionWordCue {
  return { ...cue, start: cue.start + delta, end: cue.end + delta };
}

function shiftCaption(caption: CompositionCaption, delta: MediaTime): CompositionCaption {
  return {
    ...caption,
    start: caption.start + delta,
    end: caption.end + delta,
    words: caption.words?.map((cue) => shiftWordCue(cue, delta)),
  };
}

function assertWithinCanvas(composition: CompositionIR, start: MediaTime, end: MediaTime): void {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start) {
    throw new Error("Invalid temporal interval.");
  }
  if (end > composition.canvas.duration) {
    throw new Error("Temporal interval exceeds composition duration.");
  }
}

/** Split a clip and partition clip-local animation/effect/mask state at the cut. */
export function splitClip(
  composition: CompositionIR,
  trackId: string,
  clipId: string,
  splitTime: MediaTime,
): CompositionIR {
  const track = composition.tracks.find((item) => item.id === trackId);
  if (!track) throw new Error(`Unknown track: ${trackId}`);
  const clip = assertClipExists(track, clipId);

  if (splitTime <= clip.start || splitTime >= clip.start + clip.duration) {
    throw new Error("splitTime must fall strictly inside the clip.");
  }

  const firstDuration = splitTime - clip.start;
  const secondDuration = clip.duration - firstDuration;
  const playbackRate = clip.playbackRate ?? 1;
  const sourceSpan = clip.sourceDuration ?? Math.max(1, Math.round(clip.duration * playbackRate));
  const firstSourceDuration = Math.max(1, Math.round(sourceSpan * (firstDuration / clip.duration)));
  const secondSourceDuration = Math.max(1, sourceSpan - firstSourceDuration);
  const sourceIn = clip.sourceIn ?? 0;

  const first = remapClipAnimations({
    ...clip,
    id: `${clip.id}:a`,
    duration: firstDuration,
    sourceDuration: firstSourceDuration,
    transitionOut: undefined,
  }, (time) => time, (time) => time >= clip.start && time <= splitTime);

  const second = remapClipAnimations({
    ...clip,
    id: `${clip.id}:b`,
    start: splitTime,
    duration: secondDuration,
    sourceIn: sourceIn + firstSourceDuration,
    sourceDuration: secondSourceDuration,
    transitionIn: undefined,
  }, (time) => time, (time) => time >= splitTime && time <= clip.start + clip.duration);

  return {
    ...composition,
    tracks: composition.tracks.map((item) =>
      item.id !== trackId
        ? item
        : cloneTrack(item, item.clips.flatMap((itemClip) =>
            itemClip.id === clipId ? [first, second] : [itemClip],
          )),
    ),
  };
}

/** Trim an absolute timeline interval while preserving playback-rate source semantics. */
export function trimClip(
  composition: CompositionIR,
  trackId: string,
  clipId: string,
  newStart: MediaTime,
  newEnd: MediaTime,
): CompositionIR {
  assertWithinCanvas(composition, newStart, newEnd);
  const track = composition.tracks.find((item) => item.id === trackId);
  if (!track) throw new Error(`Unknown track: ${trackId}`);
  const clip = assertClipExists(track, clipId);

  const newDuration = newEnd - newStart;
  const playbackRate = clip.playbackRate ?? 1;
  const delta = newStart - clip.start;
  const sourceIn = Math.max(0, Math.round((clip.sourceIn ?? 0) + delta * playbackRate));

  const trimmed = remapClipAnimations(
    {
      ...clip,
      start: newStart,
      duration: newDuration,
      sourceIn,
      sourceDuration: Math.max(1, Math.round(newDuration * playbackRate)),
      transitionIn: clip.transitionIn
        ? { ...clip.transitionIn, duration: Math.min(clip.transitionIn.duration, newDuration) }
        : undefined,
      transitionOut: clip.transitionOut
        ? { ...clip.transitionOut, duration: Math.min(clip.transitionOut.duration, newDuration) }
        : undefined,
    },
    (time) => time + delta,
    (time) => time >= clip.start && time <= clip.start + clip.duration,
  );

  return replaceClip(composition, trackId, clipId, trimmed);
}

/** Move a clip and all nested animation/effect/mask timelines as one temporal unit. */
export function moveClip(
  composition: CompositionIR,
  trackId: string,
  clipId: string,
  newStart: MediaTime,
): CompositionIR {
  const track = composition.tracks.find((item) => item.id === trackId);
  if (!track) throw new Error(`Unknown track: ${trackId}`);
  const clip = assertClipExists(track, clipId);

  if (!Number.isInteger(newStart) || newStart < 0) {
    throw new Error("newStart must be a non-negative integer.");
  }
  if (newStart + clip.duration > composition.canvas.duration) {
    throw new Error("Moved clip exceeds composition duration.");
  }

  const delta = newStart - clip.start;
  return replaceClip(
    composition,
    trackId,
    clipId,
    shiftClip({ ...clip, start: newStart }, delta),
  );
}

/**
 * Ripple-delete an interval with explicit synchronization scope.
 * LOCAL_TRACK: one visual track only; canvas duration is unchanged.
 * LINKED_TRACKS: primary track plus explicitly named linked tracks.
 * WHOLE_COMPOSITION: every track plus audio/captions; canvas duration shrinks.
 */
export function rippleDelete(
  composition: CompositionIR,
  trackId: string,
  start: MediaTime,
  end: MediaTime,
  options: RippleDeleteOptions = {},
): CompositionIR {
  assertWithinCanvas(composition, start, end);
  const scope = options.scope ?? "LOCAL_TRACK";
  const deletedDuration = end - start;
  const targetTrackIds = new Set<string>([trackId]);

  if (scope === "LINKED_TRACKS") {
    for (const id of options.linkedTrackIds ?? []) targetTrackIds.add(id);
  } else if (scope === "WHOLE_COMPOSITION") {
    for (const track of composition.tracks) targetTrackIds.add(track.id);
  }

  for (const id of targetTrackIds) {
    if (!composition.tracks.some((track) => track.id === id)) {
      throw new Error(`Unknown ripple track: ${id}`);
    }
  }

  const transformTrack = (track: CompositionTrack): CompositionTrack => {
    if (!targetTrackIds.has(track.id)) return track;
    const nextClips: CompositionClip[] = [];

    for (const clip of track.clips) {
      const clipEnd = clip.start + clip.duration;
      const fullyInside = clip.start >= start && clipEnd <= end;
      const overlaps = clip.start < end && clipEnd > start;

      if (fullyInside) continue;
      if (overlaps) {
        throw new Error(`Ripple-delete overlaps clip ${clip.id}; split the clip first.`);
      }

      const delta = clip.start >= end ? -deletedDuration : 0;
      nextClips.push(
        delta === 0 ? clip : shiftClip({ ...clip, start: clip.start + delta }, delta),
      );
    }

    return cloneTrack(track, nextClips);
  };

  const includeAudio =
    scope === "WHOLE_COMPOSITION" ||
    (scope === "LINKED_TRACKS" && options.includeAudio === true);
  const includeCaptions =
    scope === "WHOLE_COMPOSITION" ||
    (scope === "LINKED_TRACKS" && options.includeCaptions === true);

  const nextAudio = includeAudio
    ? composition.audio.flatMap((audio) => {
        const audioEnd = audio.start + audio.duration;
        if (audio.start >= end) return [shiftAudio(audio, -deletedDuration)];
        if (audioEnd <= start) return [audio];
        if (audio.start >= start && audioEnd <= end) return [];

        // A single audio clip cannot represent a source gap after deletion.
        // Preserve truth by rejecting a crossing edit instead of corrupting timing.
        throw new Error(`Ripple-delete overlaps audio ${audio.id}; split the audio first.`);
      })
    : composition.audio;

  const nextCaptions = includeCaptions
    ? composition.captions.flatMap((caption) => {
        if (caption.start >= end) return [shiftCaption(caption, -deletedDuration)];
        if (caption.end <= start) return [caption];
        if (caption.start >= start && caption.end <= end) return [];
        throw new Error(`Ripple-delete overlaps caption ${caption.id}; split the caption first.`);
      })
    : composition.captions;

  const canvasDuration =
    scope === "WHOLE_COMPOSITION"
      ? composition.canvas.duration - deletedDuration
      : composition.canvas.duration;

  return {
    ...composition,
    canvas: { ...composition.canvas, duration: canvasDuration },
    tracks: composition.tracks.map(transformTrack),
    audio: nextAudio,
    captions: nextCaptions,
  };
}

/** Retime while preserving source span and scaling all nested animation timelines. */
export function retimeClip(
  composition: CompositionIR,
  trackId: string,
  clipId: string,
  newDuration: MediaTime,
): CompositionIR {
  if (!Number.isInteger(newDuration) || newDuration <= 0) {
    throw new Error("newDuration must be a positive integer.");
  }

  const track = composition.tracks.find((item) => item.id === trackId);
  if (!track) throw new Error(`Unknown track: ${trackId}`);
  const clip = assertClipExists(track, clipId);

  if (clip.start + newDuration > composition.canvas.duration) {
    throw new Error("Retimed clip exceeds composition duration.");
  }

  const sourceSpan =
    clip.sourceDuration ??
    Math.max(1, Math.round(clip.duration * (clip.playbackRate ?? 1)));
  const playbackRate = sourceSpan / newDuration;

  const retimed = scaleClipTiming(
    {
      ...clip,
      duration: newDuration,
      sourceDuration: sourceSpan,
      playbackRate,
    },
    clip.start,
    clip.duration,
    newDuration,
  );

  return replaceClip(composition, trackId, clipId, retimed);
}
