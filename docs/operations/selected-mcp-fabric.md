# ShortForge Selected MCP Fabric

## Selected runtime set

| MCP | ShortForge task | Runtime policy |
|---|---|---|
| Blender MCP | F03-F06 3D scene/asset/render operations | Existing governed gateway |
| Playwright MCP | F00/F01 web research and page-grounded inspection | Navigation allowlist; interaction separately gated |
| ComfyUI MCP | F03-F06 generative visual workflows | Bounded workflow roots; production license gate |
| Qdrant MCP | Memory Fabric derived ANN retrieval | Production read; writes projection-only |
| Google Drive MCP | Bounded artifact/knowledge import-export | Existing |
| GitHub | Engineering/research integration | Existing |

## Deliberately not added

- FFmpeg MCP: duplicates the canonical RenderFabric/FFmpegService.
- Filesystem MCP: broader ambient filesystem authority than required.
- Obsidian MCP: already used as a knowledge projection.
- Remotion MCP: existing TimelineIR/Render Compiler owns execution.
- Docker MCP Gateway: infrastructure isolation, not a business capability.
- Generic MCP marketplace/discovery: not required for the closed production capability surface.

## Runtime boundary

Ascalon -> FGC/Action Graph -> Agent Execution Router -> CapabilityRegistry -> SelectedMcpGateway -> MCP server -> result/evidence -> F07

The model never selects an arbitrary MCP tool name.

The gateway:
- discovers the live MCP tool list;
- resolves only registered semantic actions;
- validates the discovered tool schema;
- enforces browser/network and filesystem bounds;
- requires Guardian authorization for mutating/high-risk actions;
- returns every MCP result as verification-required.

## Playwright

Use for controlled web source inspection, accessibility snapshots, bounded page search, and explicitly authorized clicks.

Navigation is rejected unless the URL hostname is on PLAYWRIGHT_MCP_NAV_ALLOWLIST. Unrestricted file access is disabled.

Browser output is research evidence, not F07 media proof.

## ComfyUI

Use for image generation, workflow execution, template discovery, workflow validation, and output retrieval.

Workflow and output paths must be under COMFY_MCP_ALLOWED_ROOTS.

The ShortForge gateway forces confirm_spend=false. The model cannot enable paid partner spending by argument mutation.

The current Comfy MCP is dual-licensed under AGPL-3.0-or-later or a commercial license. Hosted proprietary production routing therefore requires COMFY_MCP_LICENSE_MODE=commercial.

## Qdrant

Use as a derived semantic retrieval accelerator:

Memory Fabric canonical state -> Qdrant derived projection -> semantic retrieval -> canonical recheck -> cognitive use

A Qdrant result cannot create, supersede, or verify a canonical Memory Fabric fact.

## Deployment rule

All selected MCPs are disabled by default. Production requires pinned executable/arguments, explicit scopes, successful live tool discovery, and current capability policy.

The selected MCP results are verification-required; the owning floor contract and F07 remain the truth boundary.
