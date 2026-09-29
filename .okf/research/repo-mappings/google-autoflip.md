# Repository Mapping: Google AutoFlip / MediaPipe AutoFlip

Status: FUTURE BUILD REFERENCE
Adoption: PATTERN_EXTRACTION
Primary domain: cinematic-aware vertical reframing

Sources:
- Google Open Source Blog: https://opensource.googleblog.com/2020/02/autoflip-open-source-framework-for.html
- MediaPipe example: https://github.com/google-ai-edge/mediapipe/tree/master/mediapipe/examples/desktop/autoflip
- Inspected 2026-09-26

Observed mechanism:
- Detect scene/shot changes, identify salient content, choose a reframing mode, and optimize a smooth camera path.
- Reframing modes include stationary, panning, and tracking behavior.
- Google documents smoothing crop paths instead of directly following jittery detections.
- When required content cannot fit, the design can fall back to less aggressive framing/padding.

ShortForge treatment:
- Highest-value reference for a CinematicReframePlan.
- Plan crop mode, subject set, safe region, camera path, smoothing policy, and fallback behavior per shot.
- Keep reframe intent declarative; RenderFabric/F05 remain responsible for physical execution.
- Combine with character/subject tracks rather than using a blind center crop.

Important status note:
- MediaPipe documents AutoFlip as a legacy solution whose support ended March 1, 2023.
- Therefore the architecture pattern is useful, but the upstream legacy runtime must not be adopted as a live production dependency.

Authority:
- Research only. No second rendering fabric is introduced.
