# Floor 03 Screened GitHub References — Wave 5 (2026-09-26)

This wave broadens F03 research beyond the original nine repositories and the earlier storyboard/cinematic mappings. External repositories are evidence sources only; executable ShortForge code, contracts, tests, and .okf remain authoritative.

| Repository | New signal | F03 disposition |
|---|---|---|
| OpenAssetIO/OpenAssetIO | Stable logical entity references, resolver boundary, traits instead of storage paths | ADOPTED: ReferenceBinding entity_ref, version_selector, traits |
| OpenAssetIO/OpenAssetIO-MediaCreation | Typed media-creation traits/specification boundary | ADOPTED as clean-room reference for typed reference metadata |
| AcademySoftwareFoundation/OpenTimelineIO | Separate logical source range from currently available media | ADOPTED AS BOUNDARY RULE: F03 describes logical asset intent; downstream resolution may change without rewriting semantic scene intent |
| Comfy-Org/ComfyUI | Graph nodes, dependency-aware partial execution/re-execution and caching | ADOPTED: dependency fingerprints propagate cache invalidation through dependent AssetPlanIR nodes |
| huggingface/diffusers | Modular image/reference/structural conditioning | ADOPTED: provider-neutral ConditioningSpec |
| OpenLineage/OpenLineage | Typed run/job/dataset lineage and versioned facets | ADOPTED: PlanLineage + semantic fingerprints remain explicit and schema-bound |
| dagster-io/dagster | Stable asset keys and explicit asset dependencies | ADOPTED: dependency edges validate scene identity and current asset identity |
| HVision-NKU/StoryDiffusion | Long-range character/scene consistency | ADOPTED: continuity strategy and identity references remain first-class planning state |
| instantX-research/InstantID | Identity-preserving reference conditioning | ADOPTED: identity references become typed logical conditionings, provider-neutral |
| ali-vilab/VideoComposer | Spatial/temporal control signals for visual generation | ADOPTED: typed conditioning + motion/continuity semantics |
| Lightricks/LTX-Video | Conditioning items with strength and temporal start-frame semantics | ADOPTED: conditioning strength + bounded temporal window metadata |
| Lightricks/LTX-2 | Keyframe/video/HDR conditioning concepts | BOUNDARY REFERENCE: F03 may express conditioning intent; provider/runtime handles frame/color-space mechanics |
| contentauth/c2pa-rs | Manifest/ingredient/assertion provenance and cryptographic validation | NOT F03 AUTHORITY: useful for future F07 provenance/signing boundary |
| Vchitect/VBench | Multidimensional video-quality evaluation | NOT F03 AUTHORITY: quality scoring remains Scene Quality Judge / downstream verification |
| taylorzhou16/video-gen-en | Layered storyboard/generation parameter separation | ADOPTED through existing typed planning separation |
| iterative/dvc | Semantic reproducibility and dependency-aware stage identity | ADOPTED through source/node/plan fingerprints |
| invoke-ai/InvokeAI | Saved workflow vs executable graph boundary | ADOPTED: AssetPlanIR is declarative and non-executable |

## Concrete F03 changes promoted by this wave

1. Logical reference identity is explicit and provider-neutral.
2. Reference metadata can carry version selection and traits without storage paths or secrets.
3. Typed conditionings capture identity, style, keyframe and video controls with strength and temporal bounds.
4. Dependency fingerprints capture upstream node identity so local regeneration invalidates only the affected dependency subgraph.
5. AssetPlanIR validates dependency order, dependency identity and conditioning-to-reference binding.
6. Existing continuity/reference/repair semantics remain under F03 planning; physical generation, provider choice, signing, and final quality authority remain outside F03.

## Explicit non-adoption

No upstream code, runtime, model, prompt, provider API, credential, storage implementation, or verification authority is imported into F03.
