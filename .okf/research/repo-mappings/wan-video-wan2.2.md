# Wan2.2 → Floor 03 Mapping

Source: https://github.com/Wan-Video/Wan2.2
License: Apache-2.0

Observed pattern:
- Video generation exposes explicit text/image/video conditioning, resolution/frame-rate controls, and cinematic labels such as lighting, composition, contrast and color tone.
- Image-to-video and character-animation workflows treat conditioning inputs as explicit generation state.

ShortForge mapping:
- Confirms that F03 should separate semantic cinematic intent from provider/model execution.
- Existing CameraSpec, lighting, style tokens, reference bindings, generation input modes and platform resolution fields are the provider-neutral representation.
- Model-specific sampling, VAE, MoE routing and GPU execution remain downstream.

Status: PATTERN_EXTRACTION
