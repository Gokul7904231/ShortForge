# NVIDIA Model Optimizer → Floor 03 Mapping

Source: https://github.com/NVIDIA/Model-Optimizer

Observed pattern:
- Quantization, distillation, pruning and deployment-aware inference optimization belong at the model-serving layer.
- Optimization must be benchmarked against accuracy/latency/resource effects.

ShortForge mapping:
- Keep inference optimization in Ascalon/Fast Decision Core.
- Do not contaminate F03 semantic contracts with runtime-specific optimization.

Status: ARCHITECTURE_REFERENCE
