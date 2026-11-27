# OKF Rule -> Enforcement -> Evidence Matrix

The machine source is .okf/rules/index.json. This document is the human-readable projection.

| Rule ID | Severity | Primary enforcement | Evidence |
|---|---|---|---|
| OKF.PROCESS.FULL_SWEEP | CRITICAL | OKF sweep compiler | sweep envelope |
| OKF.GOVERNANCE.TEAM_GATE | CRITICAL | Team Change Gate + CI | Team report |
| OKF.AUTH.MODEL_NON_SOVEREIGN | CRITICAL | Guardian/runtime | authority evidence |
| OKF.EVIDENCE.UNPROVEN_NOT_PASS | CRITICAL | deterministic report validator | CI evidence |
| OKF.SECURITY.LEAST_PRIVILEGE | CRITICAL | CapabilityRegistry/Guardian | permission tests |
| OKF.RELEASE.F07_VERIFIED | CRITICAL | F07 + release controls | release evidence |
| OKF.MEDIA.G1_GEOMETRY | CRITICAL | `apps/web/factoryos/core/fabric/verification/RenderArtifactVerifier.ts:134-142` | `apps/web/factoryos/tests/p2-render-gates.test.ts:66` (`bad_g01_geometry_720x1280.mp4`) |
| OKF.MEDIA.G2_EXACT_FPS | CRITICAL | `apps/web/factoryos/core/fabric/verification/RenderArtifactVerifier.ts:144-150` | `apps/web/factoryos/tests/p2-render-gates.test.ts:67` (`bad_g02_fps_2997.mp4`) |
| OKF.MEDIA.G3_PIX_FMT | CRITICAL | `apps/web/factoryos/core/fabric/verification/RenderArtifactVerifier.ts:152-158` | `apps/web/factoryos/tests/p2-render-gates.test.ts:68` (`bad_g03_pixfmt_yuv444p.mp4`) |
| OKF.MEDIA.G4_COLOR_BT709 | CRITICAL | `apps/web/factoryos/core/fabric/verification/RenderArtifactVerifier.ts:160-171` | `apps/web/factoryos/tests/p2-render-gates.test.ts:69` (`bad_g04_color_bt601_pc.mp4`) |
| OKF.MEDIA.G5_AUDIO_FORMAT | CRITICAL | `apps/web/factoryos/core/fabric/verification/RenderArtifactVerifier.ts:179-192` | `apps/web/factoryos/tests/p2-render-gates.test.ts:70` (`bad_g05_audio_mono_44100.mp4`) |
| OKF.MEDIA.G6_LOUDNESS | CRITICAL | `apps/web/factoryos/core/fabric/verification/RenderArtifactVerifier.ts:251-258` | `apps/web/factoryos/tests/p2-render-gates.test.ts:71` (`bad_g06_loudness_quiet.mp4`) |
| OKF.MEDIA.G7_TRUE_PEAK | CRITICAL | `apps/web/factoryos/core/fabric/verification/RenderArtifactVerifier.ts:260-265` | `apps/web/factoryos/tests/p2-render-gates.test.ts:72` (`bad_g07_truepeak_clip.mp4`) |
| OKF.MEDIA.G8_AV_DRIFT | CRITICAL | `apps/web/factoryos/core/fabric/verification/RenderArtifactVerifier.ts:206-219` | `apps/web/factoryos/tests/p2-render-gates.test.ts:73` (`bad_g08_av_drift_300ms.mp4`) |
| OKF.MEDIA.G9_FASTSTART | CRITICAL | `apps/web/factoryos/core/fabric/verification/RenderArtifactVerifier.ts:221-223` | `apps/web/factoryos/tests/p2-render-gates.test.ts:74` (`bad_g09_no_faststart.mp4`) |
| OKF.MEDIA.G10_FRAME_COUNT | CRITICAL | `apps/web/factoryos/core/fabric/verification/RenderArtifactVerifier.ts:225-236` | `apps/web/factoryos/tests/p2-render-gates.test.ts:75` (`bad_g10_frame_count_mismatch.mp4`) |
| OKF.MEDIA.G11_SAMPLE_EXACT | CRITICAL | `apps/web/factoryos/core/fabric/verification/RenderArtifactVerifier.ts:238-249` | `apps/web/factoryos/tests/p2-render-gates.test.ts:76` (`bad_g11_sample_count_mismatch.mp4`) |
| OKF.MEDIA.G12_SAFE_AREA | CRITICAL | `apps/web/factoryos/core/fabric/verification/RenderArtifactVerifier.ts:267-269` | `apps/web/factoryos/tests/p2-render-gates.test.ts:77` (`bad_g12_safe_area_violation.mp4`) |

A linked enforcement point is not itself proof that the underlying control is currently passing.
