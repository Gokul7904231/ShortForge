# HunyuanVideo-1.5 → Floor 03 Mapping

Source: https://github.com/Tencent-Hunyuan/HunyuanVideo-1.5

Observed pattern:
- Video generation is exposed through explicit generation conditions and runtime settings separated from the semantic request.
- The implementation is optimized for executable model inference rather than a canonical semantic production plan.

ShortForge mapping:
- Supports keeping inference/runtime parameters outside AssetPlanIR.
- F03 remains provider-neutral and records semantic intent only.

Status: ARCHITECTURE_REFERENCE
