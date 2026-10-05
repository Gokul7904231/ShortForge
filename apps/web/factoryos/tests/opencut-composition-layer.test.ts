            keyframes: [
              { time: millisecondsToMediaTime(1_000), value: 1 },
              { time: millisecondsToMediaTime(2_000), value: 2 },
            ],
          }],
          sourceDuration: millisecondsToMediaTime(4_000),
        }, original.tracks[0].clips[1]],
      }],
    };

    const retimed = retimeClip(
      withSource,
      "video-main",
      "clip-a",
      millisecondsToMediaTime(2_000),
    );
    const clip = retimed.tracks[0].clips[0];

    expect(clip.playbackRate).toBe(2);
    expect(clip.sourceDuration).toBe(millisecondsToMediaTime(4_000));
    expect(clip.animations?.[0].keyframes.map((frame) => frame.time)).toEqual([
      millisecondsToMediaTime(500),
      millisecondsToMediaTime(1_000),
    ]);
  });

  it("supports scoped ripple editing and preserves synchronized auxiliary tracks", () => {
    const local = rippleDelete(
      rippleFixture(),
      "video-main",
      millisecondsToMediaTime(2_000),
      millisecondsToMediaTime(3_000),
      { scope: "LOCAL_TRACK" },
    );
    expect(local.canvas.duration).toBe(millisecondsToMediaTime(10_000));
    expect(local.tracks[0].clips[1].start).toBe(millisecondsToMediaTime(2_000));
    expect(local.audio[0].start).toBe(0);

    const whole = rippleDelete(
      rippleFixture(),
      "video-main",
      millisecondsToMediaTime(2_000),
      millisecondsToMediaTime(3_000),
      { scope: "WHOLE_COMPOSITION" },
    );

    expect(whole.canvas.duration).toBe(millisecondsToMediaTime(9_000));
    expect(whole.audio.find((audio) => audio.id === "voice-after")?.start)
      .toBe(millisecondsToMediaTime(2_000));
    expect(whole.captions[0].start).toBe(millisecondsToMediaTime(2_000));
    expect(whole.captions[0].words?.[0].start).toBe(millisecondsToMediaTime(2_100));
  });

  it("keeps OpenCut behind an explicit experimental admission boundary", () => {
    expect(OpenCutAdapter.admission().productionEligible).toBe(false);
    expect(OpenCutAdapter.capability().status).toBe("EXPERIMENTAL");
    expect(isCapabilitySupported(OpenCutAdapter.capability(), "keyframes")).toBe(true);
    expect(OpenCutAdapter.capability().executionModes).toEqual([]);