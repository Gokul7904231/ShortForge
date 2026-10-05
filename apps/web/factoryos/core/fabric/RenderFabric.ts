
  private normalizeLocalRenderIntent(
    intent: RenderIntent,
    explicitOutputPath?: string
  ): LocalRenderIntent {
    const captionText = intent.tracks.captions
      .map((cue) => cue.text.trim())
      .filter(Boolean)
      .join(" ");

    const primaryAudio =
      intent.tracks.audioTracks.find((track) => track.type === "VOICE") ??
      intent.tracks.audioTracks[0];

    const scenes =
      intent.tracks.visualAssets.length > 0
        ? intent.tracks.visualAssets.map((asset) => {
            const overlappingCues = intent.tracks.captions.filter(
              (cue) =>
                cue.startMs < (asset.startSeconds + asset.durationSeconds) * 1000 &&
                cue.endMs > asset.startSeconds * 1000
            );

            return {
              scene_id: asset.id,
              template_id: `render.${asset.type.toLowerCase()}.v1`,
              narration_text:
                overlappingCues
                  .map((cue) => cue.text.trim())
                  .filter(Boolean)
                  .join(" ") ||
                captionText ||
                intent.compositionType,
              duration_seconds: asset.durationSeconds,
              ...(primaryAudio
                ? {
                    audio_track: {
                      track_id: primaryAudio.id,
                      audio_path: primaryAudio.src,
                      start_seconds: primaryAudio.startSeconds,
                      duration_seconds: primaryAudio.durationSeconds,
                      volume: primaryAudio.volume,
                    },
                  }
                : {}),
              shots: [
                {
                  id: `shot_${asset.id}`,
                  recipe_id: "RENDER_ASSET",
                  start_seconds: 0,
                  duration_seconds: asset.durationSeconds,
                  props: {
                    source: asset.src,
                    assetType: asset.type,
                    transform: asset.transform,
                  },
                },
              ],
            };
          })
        : [
            {
              scene_id: "scene_01",
              template_id: "facts.rapid-facts.v1",
              narration_text: captionText || intent.compositionType,
              duration_seconds: intent.durationSeconds,
              ...(primaryAudio
                ? {
                    audio_track: {
                      track_id: primaryAudio.id,
                      audio_path: primaryAudio.src,
                      start_seconds: primaryAudio.startSeconds,
                      duration_seconds: primaryAudio.durationSeconds,
                      volume: primaryAudio.volume,
                    },
                  }
                : {}),
              shots: [],
            },
          ];


    return {
      project_id: intent.missionId || intent.intentId,
      title: `ShortForge ${intent.compositionType}`,
      output_path:
        explicitOutputPath ||
        path.join(process.cwd(), "data", "renders", `${intent.jobId}.mp4`),
      scenes,
      output: {
        width: intent.resolution.width,
        height: intent.resolution.height,
        fps: intent.fps,
        video_codec: "h264",
        audio_codec: "aac",
      },
      safe_area: {
        top: 160,
        bottom: 320,
        left: 60,
        right: 120,
      },
      metadata: {
        intentId: intent.intentId,
        compositionType: intent.compositionType,
        captions: intent.tracks.captions,
        audioTrack: primaryAudio,
        sourceComposition: intent.sourceCompositionCanonicalJson
          ? {
              compositionId: intent.sourceCompositionId,
              schemaVersion: intent.sourceCompositionSchemaVersion,
              hashSha256: intent.sourceCompositionHashSha256,
              canonicalJson: intent.sourceCompositionCanonicalJson,
            }
          : undefined,
      },
    };
  }
}