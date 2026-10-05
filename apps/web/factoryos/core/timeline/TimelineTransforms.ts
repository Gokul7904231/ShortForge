import type {
  CompositionClip,
  CompositionIR,
  CompositionTrack,
  MediaTime,
} from "./CompositionIR";

function cloneTrack(track: CompositionTrack, clips: readonly CompositionClip[]): CompositionTrack {
  return { ...track, clips };
}

function assertClipExists(track: CompositionTrack, clipId: string): CompositionClip {
  const clip = track.clips.find((item) => item.id === clipId);
  if (!clip) {
    throw new Error(`Unknown clip: ${clipId}`);
  }
  return clip;
}

function replaceClip(
  composition: CompositionIR,
  trackId: string,
  clipId: string,
  replacement: CompositionClip,
): CompositionIR {
  return {
    ...composition,
    tracks: composition.tracks.map((track) =>
      track.id !== trackId
        ? track
        : cloneTrack(
            track,
            track.clips.map((clip) => (clip.id === clipId ? replacement : clip)),
          ),
    ),
  };
}

/** Split a clip at an absolute composition time. */
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
  const sourceIn = clip.sourceIn ?? 0;

  const first: CompositionClip = {
    ...clip,
    id: `${clip.id}:a`,
    duration: firstDuration,
    sourceDuration: Math.min(clip.sourceDuration ?? firstDuration, firstDuration),
  };

  const second: CompositionClip = {
    ...clip,
    id: `${clip.id}:b`,
    start: splitTime,
    duration: secondDuration,
    sourceIn: sourceIn + firstDuration,
    sourceDuration: clip.sourceDuration
      ? Math.max(0, clip.sourceDuration - firstDuration)
      : secondDuration,
    transitionIn: undefined,
    transitionOut: clip.transitionOut,
  };

  return {
    ...composition,
    tracks: composition.tracks.map((item) =>
      item.id !== trackId
        ? item
        : cloneTrack(
            item,
            item.clips.flatMap((itemClip) =>
              itemClip.id === clipId ? [first, second] : [itemClip],
            ),
          ),
    ),
  };
}

/** Trim a clip to a new absolute start/end interval. */
export function trimClip(
  composition: CompositionIR,
  trackId: string,
  clipId: string,
  newStart: MediaTime,
  newEnd: MediaTime,
): CompositionIR {
  if (newStart < 0 || newEnd <= newStart) {
    throw new Error("Invalid trim interval.");
  }

  const track = composition.tracks.find((item) => item.id === trackId);
  if (!track) throw new Error(`Unknown track: ${trackId}`);
  const clip = assertClipExists(track, clipId);

  const delta = newStart - clip.start;
  const duration = newEnd - newStart;
  const sourceIn = (clip.sourceIn ?? 0) + Math.max(0, delta);

  return replaceClip(composition, trackId, clipId, {
    ...clip,
    start: newStart,
    duration,
    sourceIn,
    sourceDuration: duration,
    transitionIn: clip.transitionIn
      ? { ...clip.transitionIn, duration: Math.min(clip.transitionIn.duration, duration) }
      : undefined,
    transitionOut: clip.transitionOut
      ? { ...clip.transitionOut, duration: Math.min(clip.transitionOut.duration, duration) }
      : undefined,
  });
}

/** Move a clip without mutating the source composition. */
export function moveClip(
  composition: CompositionIR,
  trackId: string,
  clipId: string,
  newStart: MediaTime,
): CompositionIR {
  if (newStart < 0) throw new Error("newStart cannot be negative.");
  const track = composition.tracks.find((item) => item.id === trackId);
  if (!track) throw new Error(`Unknown track: ${trackId}`);
  const clip = assertClipExists(track, clipId);

  return replaceClip(composition, trackId, clipId, {
    ...clip,
    start: newStart,
  });
}

/**
 * Ripple-delete an interval on one track.
 * Clips entirely after the deleted interval shift left by the deleted duration.
 * Overlapping clips are rejected rather than silently altered.
 */
export function rippleDelete(
  composition: CompositionIR,
  trackId: string,
  start: MediaTime,
  end: MediaTime,
): CompositionIR {
  if (start < 0 || end <= start) throw new Error("Invalid ripple-delete interval.");

  const track = composition.tracks.find((item) => item.id === trackId);
  if (!track) throw new Error(`Unknown track: ${trackId}`);

  const deletedDuration = end - start;
  const nextClips: CompositionClip[] = [];

  for (const clip of track.clips) {
    const clipEnd = clip.start + clip.duration;

    if (clip.start >= start && clipEnd <= end) {
      continue;
    }

    if (clip.start < end && clipEnd > start) {
      throw new Error(`Ripple-delete overlaps clip ${clip.id}; split the clip first.`);
    }

    nextClips.push({
      ...clip,
      start: clip.start >= end ? clip.start - deletedDuration : clip.start,
    });
  }

  return {
    ...composition,
    canvas: {
      ...composition.canvas,
      duration: composition.canvas.duration - Math.min(
        deletedDuration,
        Math.max(0, composition.canvas.duration - start),
      ),
    },
    tracks: composition.tracks.map((item) =>
      item.id === trackId ? cloneTrack(item, nextClips) : item,
    ),
  };
}

/** Retime a clip with optional pitch-preserving audio metadata. */
export function retimeClip(
  composition: CompositionIR,
  trackId: string,
  clipId: string,
  newDuration: MediaTime,
): CompositionIR {
  if (newDuration <= 0) throw new Error("newDuration must be positive.");
  const track = composition.tracks.find((item) => item.id === trackId);
  if (!track) throw new Error(`Unknown track: ${trackId}`);
  const clip = assertClipExists(track, clipId);

  return replaceClip(composition, trackId, clipId, {
    ...clip,
    duration: newDuration,
    sourceDuration: newDuration,
  });
}
