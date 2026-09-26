# Floor 03 Screened GitHub References — Wave 4

This wave deliberately expands the F03 research scope beyond the earlier repository set.

| Repository | Signal | F03 treatment |
|---|---|---|
| OpenLineage/OpenLineage | First-class lineage + versioned facets | Adopted as typed internal lineage |
| iterative/dvc | Dependency/reproducibility identity | Adopted as semantic fingerprint discipline |
| dagster-io/dagster | Blocking asset checks | Adopted as structural preflight pattern |
| invoke-ai/InvokeAI | Saved workflow vs executable graph | Adopted as non-executable AssetPlanIR boundary |
| divolleggett/character-consistency-skill | Reference-first storyboard | Adopted as continuity strategy |
| taylorzhou16/video-gen-en | Layered storyboard and parameter consistency | Adopted as planning separation |
| NVIDIA-NeMo/Guardrails | Explicit validation rails | Adopted only as a validation-boundary pattern |

No external source code, prompts, tests, models, or runtime dependencies were copied.


## Validation implementation note

The adopted patterns are reflected in executable F03 validation as well as documentation: OpenLineage-style lineage is typed in AssetPlanIR; DVC-style semantic identity is separated from runtime asset identity; Dagster/Guardrails-style structural checks fail closed before handoff; and the F03 Guardian gate is isolated from unrelated Floor 02 scenario dependencies. No external runtime code is imported.
