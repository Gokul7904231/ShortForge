# Skill: Render Orchestration
id: render-orchestration
version: 1.0.0
owner: Overseer / Compute Plane Team

## WHEN TO USE
Invoked to assemble timeline scenes, audio tracks, subtitles, and motion graphics into a validated MP4 video artifact.

## REQUIRED INPUTS
- `missionId`: Parent mission ID
- `timeline`: Complete deterministic timeline JSON
- `userRole`: Server-authoritative user role (constrains execution policy, not provider vendor)

## REQUIRED ACCESS
- Capabilities: `video_rendering`, `render_claim`
- Tools: `dispatch_render_job`, `poll_render_status`, `verify_mp4_integrity`

## EXECUTION SEQUENCE
1. Request worker assignment from ComputeRouter using render requirements and policy.
2. Dispatch render payload with execution token and atomic lock.
3. Track heartbeat and render progress.
4. On render completion, verify MP4 file size, resolution, and duration with FFprobe.
5. Create RENDERED_VIDEO Artifact and commit Evidence.

## DECISION RULES
- IF render job times out or worker heartbeat lost, trigger RecoveryAgent with backoff.
- IF output artifact is corrupt (< 1000 bytes or invalid header), reject artifact and retry.

## SAFETY BOUNDARIES
- Server-side role enforcement; provider choice is capability/policy driven.
- Zero quota finalize before validated artifact.

## EXPECTED OUTPUT
RENDERED_VIDEO artifact with storage URI, mimeType, and sizeBytes.
