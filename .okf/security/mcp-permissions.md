# ShortForge / FactoryOS — MCP Permission Contract

> **Status:** CANONICAL SECURITY EXTENSION
> **Purpose:** Define least-privilege rules for MCP integrations.

## 1. MCP is not ambient authority

Connecting an MCP server does not grant every worker access to every tool exposed by that server.

MCP access must be explicit, capability-bound, and scoped to a task/session.

## 2. Capability vocabulary

Reserved MCP capability names:

- `CAP_MCP_DRIVE_READ`
- `CAP_MCP_DRIVE_WRITE`
- `CAP_MCP_BROWSER_RESEARCH`
- `CAP_MCP_GITHUB_READ`
- `CAP_MCP_GITHUB_WRITE`

These names do not automatically exist in the executable CapabilityRegistry until implemented and tested.


## 3. Blender MCP posture

### CAP_MCP_BLENDER_USE

Permits a worker to use the ShortForge Blender MCP gateway for explicitly granted semantic Blender actions.

Allowed baseline floors:
- F03 Asset Realization
- F04 Media Synthesis
- F05 Timeline Composition
- F06 Rendering

Requires:
- explicit worker/session capability grant
- blender.mcp executable capability present and production-routable
- Guardian authorization for mutating/high-risk actions
- private Blender addon socket boundary
- runtime MCP tool discovery
- semantic-action resolution
- post-mutation observation
- physical artifact verification for render/export

Does not permit:
- arbitrary MCP tool selection from model output
- capability minting
- lease/fencing changes
- F07 release authority
- publication authority
- unrestricted Python

### CAP_MCP_BLENDER_PYTHON_EXECUTE

Reserved for explicitly authorized workflows only.

Requires:
- CAP_MCP_BLENDER_USE
- Guardian grant with auditable certificate
- explicit PYTHON_EXECUTE semantic action
- runtime flag BLENDER_MCP_ALLOW_PYTHON=true
- arguments.code present
- independent post-execution verification

Default state: **DENIED / DISABLED**.

Arbitrary Blender Python must never be treated as the normal path when a constrained semantic action can express the requested operation.

## 3. Google Drive posture

### CAP_MCP_DRIVE_READ

Permits:

- Drive health
- bounded list/search
- metadata retrieval
- bounded download/export

Requires:

- authenticated Drive connection
- valid server process boundary
- local download containment
- provider response handling

Does not permit:

- ACL changes
- delete/trash
- publication
- release authorization
- arbitrary filesystem writes

### CAP_MCP_DRIVE_WRITE

Permits:

- create folder
- upload from an allowlisted local path

Requires all read conditions plus:

- explicit readwrite Drive scope
- explicit local source-path allowlist
- bounded file size
- audit/telemetry
- no implicit public sharing

The v0.1 Google Drive MCP does not expose permission mutation or public sharing.

## 4. Production worker rule

No F00-F07 worker receives MCP capabilities by default.

A worker using an MCP must have:

- explicit capability grant
- explicit skill declaration
- input/output schema
- tool budget
- timeout/cancellation behavior
- lease/fencing rules where the action is side-effecting
- verification expectations
- audit record

## 5. Operator rule

Human operators may use MCPs through an approved host, but human access does not waive FactoryOS production invariants.

An operator can inspect or export an artifact through Drive MCP without making that artifact verified or publishable.

## 6. Secret rule

MCP configuration must never embed:

- OAuth refresh tokens
- client secrets
- service-account private keys
- session cookies
- channel access tokens

Secrets remain environment/secret-manager concerns.

## 7. Filesystem rule

MCP filesystem access must be allowlisted.

For Google Drive MCP:

- uploads: `DRIVE_MCP_ALLOWED_UPLOAD_ROOTS`
- downloads: `DRIVE_MCP_DOWNLOAD_ROOT`

Path traversal and symlink escape must be denied.

## 8. Verification rule

MCP success is not production proof.

For media:

`MCP upload success != artifact verification != publication success`

Production truth continues to come from physical artifact evidence, F07 verification, and the delivery/release boundary.

## 9. Permission change routine

For any new MCP capability:

1. define role/floor/environment scope
2. define tool schemas
3. define filesystem/network side effects
4. define deny conditions
5. add positive and negative tests
6. run production-helper checks
7. record the decision in `.okf/decisions.md`
8. update the executable CapabilityRegistry before production use


## 10. Selected MCP capabilities

### CAP_MCP_PLAYWRIGHT_RESEARCH
- F00/F01 research only.
- Navigation requires the configured PLAYWRIGHT_MCP_NAV_ALLOWLIST.
- Browser file access is restricted; unrestricted file access is disabled.
- Results are observations/evidence inputs, not F07 proof.

### CAP_MCP_PLAYWRIGHT_INTERACT
- Explicit click actions only.
- Disabled by default.
- Guardian certificate required.
- Does not grant publication, credential, or secret authority.

### CAP_MCP_COMFY_READ
- server_info, search_templates, validate_workflow only.
- No execution side effects.

### CAP_MCP_COMFY_EXECUTE
- run_workflow, generate_image, fetch_outputs.
- Workflow/output paths must be inside COMFY_MCP_ALLOWED_ROOTS.
- confirm_spend is forced false by the ShortForge gateway.
- Hosted proprietary production requires explicit COMFY_MCP_LICENSE_MODE=commercial.
- Comfy MCP never becomes the canonical media authority; RenderFabric/F07 remain authoritative.

### CAP_MCP_QDRANT_READ
- qdrant-find only.
- Collection identity is pinned by the MCP server environment to a shortforge-derived-* collection.
- Results are derived retrieval candidates and require canonical Memory Fabric recheck.

### CAP_MCP_QDRANT_DERIVED_WRITE
- qdrant-store only.
- Development/staging only.
- projectionOnly=true and canonicalAuthority=memory-fabric are injected.
- Cannot create, mutate, supersede, or verify canonical Memory Fabric facts.

## 11. Selected MCP rule
No selected MCP becomes ambient authority. A capability grant exposes a semantic action set, never an arbitrary remote tool list.


## 10.1 ComfyUI programmable visual transformation

### CAP_MCP_COMFY_TRANSFORM

ComfyUI is also exposed as a transformation engine for already-retrieved visual assets.

Allowed execution path:
- F04 Media Synthesis
- F05 Timeline Composition
- F06 Rendering

The transformation path is recipe-bound:
1. ShortForge selects a registered transformation recipe.
2. Source media is staged under COMFY_MCP_TRANSFORM_ROOT.
3. The engine materializes a recipe workflow and records its SHA-256 digest.
4. The gateway validates the workflow against the live ComfyUI install.
5. The gateway requires the recipe ID, workflow path, and matching workflow digest.
6. ComfyUI executes the approved graph.
7. Outputs are copied to a bounded transform output directory.
8. ShortForge validates, hashes, curates, and stores the result as a derived asset with parent lineage.

Initial recipe:
- upscale-2x-realesrgan

Planned recipe classes:
- IMG2IMG_RESTYLE
- INPAINT
- OUTPAINT_9_16
- DETAIL_ENHANCE

These recipe classes are not production-routable until an executable recipe and fresh validation exist.

The transformation layer must not:
- replace Wikimedia/Openverse retrieval as the default asset source;
- mutate or delete the parent asset;
- accept arbitrary workflow JSON authored by the model;
- treat a Comfy job success response as F07 proof;
- alter source license/attribution metadata;
- grant release or publication authority.

For transformed media, license/attribution metadata is inherited from the parent asset unless an explicit policy proves a different disposition.
