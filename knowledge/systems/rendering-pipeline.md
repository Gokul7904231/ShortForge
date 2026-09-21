---
id: system-rendering-pipeline
type: architecture
title: ShortForge Execution Plane Rendering Pipeline
status: stable
stale_after: 2027-08-25T00:00:00Z
sources:
  - id: create-short
    resource: services/rendering-engine/scripts/create_short.py
    title: Short Creation Script
sf_id: system-rendering-pipeline
sf_lifecycle: active
sf_epistemic_state: sourced
sf_verification_state: verified
epistemic_state: sourced
verification: verified
created_at: 2026-08-25T10:00:00Z
updated_at: 2026-09-20T17:00:00Z
tags:
  - rendering
  - ffmpeg
  - edge-tts
  - whisper
  - pipeline
sf_provenance:
  source_type: FILE
  source_id: services/rendering-engine/scripts/create_short.py
  path: services/rendering-engine/scripts/create_short.py
  start_line: 1
  end_line: 150
  captured_at: 2026-08-25T10:00:00Z
provenance:
  source_type: FILE
  source_id: services/rendering-engine/scripts/create_short.py
  path: services/rendering-engine/scripts/create_short.py
  start_line: 1
  end_line: 150
  captured_at: 2026-08-25T10:00:00Z
---

# System: Rendering Pipeline

## 1. Overview
The rendering pipeline converts raw structured video manifests (`JobManifest`) into vertical 1080×1920 MP4 short videos ready for publishing.

## 2. Pipeline Stages
1. **Manifest Ingestion**: `POST /api/render/jobs` receives JSON manifest containing script segments, voice configuration, background imagery, and subtitle parameters.
2. **Audio Synthesis**: `edge-tts` generates per-segment voiceover audio files.
3. **Audio Transcription & Word-Level Alignment**: `faster-whisper` extracts precise word timestamps for animated subtitle overlays.
4. **Visual Composition**: `Pillow` composites scene layers, vertical 9:16 aspect ratio framing, and title graphics.
5. **Video Assembly (FFmpeg)**: `ffmpeg` combines composite frames, background video, and synthesized audio using `libx264 ultrafast` preset.
6. **Quality Verification**: `ffprobe` inspects output MP4 duration, bitrate, resolution, and audio track integrity.
7. **Delivery & Callback**: The rendered MP4 is uploaded to Cloudinary CDN; worker invokes `POST /api/rendering/callback` on Control Plane with HMAC `executionToken`.

## 3. Key Source Files
- `services/rendering-engine/basic_render_api.py` (Warm pool HTTP API, port 8100)
- `services/rendering-engine/basic_render_worker.py` (Async worker thread & process executor)
- `services/rendering-engine/scripts/create_short.py` (FFmpeg / Pillow / edge-tts compositor)
- `apps/web/app/api/rendering/callback/route.ts` (Authoritative completion callback handler)
