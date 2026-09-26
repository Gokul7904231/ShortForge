# Repo Mapping — NVIDIA NeMo Guardrails

Repository: https://github.com/NVIDIA-NeMo/Guardrails

Observed pattern:
- Input, retrieval, execution, and output validation can be explicit rails.
- Validation is a boundary distinct from model generation.
- Invalid content/tool behavior can be blocked before downstream execution.

ShortForge mapping:
- F03 uses deterministic structural validation for the planning IR.
- Guardian remains responsible for security/policy capability authority and F07 remains responsible for physical artifact verification.

Not adopted:
- NeMo runtime, model integrations, or safety policy ownership inside F03.

Status: ARCHITECTURE_REFERENCE
