# ComfyUI MCP — Programmable Visual Transformation Engine

## Purpose

ShortForge remains retrieval-first for ordinary visual assets:

cache/B2 -> Wikimedia Commons + Openverse -> policy -> ranking -> resolved asset

ComfyUI MCP is a downstream transformation layer for a resolved asset. It is not the default visual source and it is not the canonical media authority.

## Transformation model

A transformation is a typed plan, not free-form model-authored Comfy graph code.

VisualTransformPlan:
- parent asset identity
- ordered transformation steps
- trusted recipe IDs
- bounded parameters
- Guardian certificate
- mission/job/floor/environment identity

A step contains:
- operation
- recipeId
- recipeVersion
- parameter digest

Current operation:
- UPSCALE_2X

Planned operations:
- IMG2IMG_RESTYLE
- INPAINT
- OUTPAINT_9_16
- DETAIL_ENHANCE

## Runtime loop

1. Receive a resolved CandidateAsset from the existing visual asset system.
2. Copy the source into COMFY_MCP_TRANSFORM_ROOT.
3. Stage it into the target ComfyUI input area through the Comfy MCP upload_file tool.
4. Materialize a trusted API-format workflow recipe.
5. Compute a workflow SHA-256.
6. Validate the workflow against the live ComfyUI node/model inventory.
7. Execute only when Guardian authorization is present.
8. Wait on the exact returned Comfy job identifier.
9. Fetch outputs into the bounded transform output directory.
10. Curate and validate the output using ShortForge's AssetCurator.
11. Hash the final normalized output.
12. Store it as a new visual asset in B2 and Firestore.
13. Preserve parent identity and source license/attribution metadata.
14. Return the derived asset plus transformation lineage.
15. F07 remains the independent physical truth boundary.

## Programmability boundary

The model may propose:

UPSCALE_2X(sourceAsset)

but it may not provide:
- an arbitrary workflow JSON
- an arbitrary Comfy tool name
- an arbitrary filesystem destination
- a paid-spend override
- a new recipe without code/governance review

Recipe selection is the programmable unit. The trusted recipe owns graph structure and node bindings; runtime parameters are bounded and digestible.

## Why this is valuable for current assets

The existing Wikimedia/Openverse pipeline already solves asset discovery, license metadata, caching and B2 storage. Comfy can improve those same assets where retrieval quality is insufficient.

Examples:
- low-resolution historical image -> AI upscale
- source looks correct but is not portrait-friendly -> future 9:16 outpaint recipe
- source visual needs controlled stylistic harmonization -> future low-denoise img2img recipe
- a source contains a bounded visual defect -> future inpaint recipe
- a small asset needs more detail before composition -> enhancement recipe

Simple crop, resize, and color conversion remain local ShortForge operations when AI is unnecessary.

## Immutability and provenance

The parent asset is never overwritten.

Every derived asset records:
- parentAssetId
- parentSha256
- transformationId
- recipeId
- recipeVersion
- parametersSha256
- creation timestamp

The derived asset inherits the source attribution/license metadata unless a later policy explicitly establishes another legal disposition.

## Failure behavior

Fail closed on:
- missing Guardian certificate
- missing transform root
- source outside transform root
- unknown recipe
- recipe/operation mismatch
- workflow outside transform root
- workflow digest mismatch
- live Comfy validation failure
- missing job identifier
- job timeout/failure
- missing raster output
- output curation failure

A failed transformation never replaces the parent asset.

## Production qualification

A recipe is production-routable only after:
- its workflow is committed and reviewed;
- live node/model compatibility is verified;
- positive and negative tests exist;
- output hashes and lineage are recorded;
- physical output inspection is covered by the downstream verification path;
- Comfy MCP production licensing is explicitly configured where required.

The initial recipe is a production-candidate implementation only; it still requires a live ComfyUI worker with the configured upscaler model and fresh CI validation before production enablement.
