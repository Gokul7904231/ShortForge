# Selected MCP Research Mapping — 2026-10-01

ShortForge selected only three new MCPs because they close concrete capability gaps without introducing duplicate authorities.

## 1. Playwright MCP

Source: https://github.com/microsoft/playwright-mcp

Current capabilities include browser navigation, accessibility snapshots, page find, click and typing. The project documents host/origin controls and restricted filesystem access. ShortForge exposes a narrower semantic surface and adds its own navigation hostname allowlist.

License: Apache-2.0.

## 2. Comfy-Org comfy-mcp

Source: https://github.com/Comfy-Org/comfy-mcp

Current server is a local ComfyUI MCP with a documented run path around server_info, run_workflow and fetch_outputs, plus generation/template helpers. It invokes the Comfy CLI as a separate process.

License: AGPL-3.0-or-later or commercial license. ShortForge treats it as an external provider process and blocks hosted proprietary production unless commercial license mode is explicitly enabled.

## 3. Qdrant MCP

Source: https://github.com/qdrant/mcp-server-qdrant

Current server exposes qdrant-find and qdrant-store for semantic retrieval/storage.

License: Apache-2.0.

ShortForge uses Qdrant only as a derived ANN projection. Memory Fabric remains canonical.

## 4. Non-adoption

FFmpeg MCP was not added because RenderFabric/FFmpegService is already the canonical media execution path. Filesystem, Obsidian, Remotion and Docker MCP integrations were also not added in this wave because their useful duties are already covered by narrower internal boundaries or infrastructure.

## 5. Security invariant

MCP never:
- mints capability;
- bypasses Guardian/FGC/AEF;
- marks F07 proof;
- publishes media;
- becomes canonical memory;
- receives arbitrary model-selected tool names.

Every selected MCP call carries a live capability snapshot digest and verification-required result metadata.
