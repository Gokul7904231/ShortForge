# Paperclip → Floor 03 Mapping

Source: https://github.com/paperclipai/paperclip

Observed pattern:
- Clear control-plane versus execution-plane separation.
- Durable task state and explicit adapter boundaries.
- Execution resources and orchestration responsibilities are separated.

ShortForge mapping:
- F03 stays a specification/planning floor.
- Provider execution and credentials stay downstream and outside the F03 contract.
- AssetPlanIR is an adapter-neutral handoff artifact rather than an execution job.

Not adopted:
- Paperclip runtime/orchestration code or authority model.

Status: PATTERN_EXTRACTION
