/**
 * FactoryOS v1 — Deterministic Graph Renderer
 * Renders GraphPresentationIR into deterministic SVG and standalone interactive HTML.
 * Includes pan/zoom, node/edge inspector, truth badges, evidence drilldown, and search.
 * Verifies generated visual artifacts and maintains last-known-good state.
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createHash } from "node:crypto";
import {
  FactoryOSVisualTokens,
  type GraphPresentationIR,
  type PresentationNode,
  type PresentationEdge,
  type VisualizationReceipt,
} from "./PresentationIR";
import { GraphPresentationValidator, LastGoodVisualStore } from "./GraphPresentationValidator";

export interface LayoutNode {
  readonly node: PresentationNode;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface LayoutResult {
  readonly layoutNodes: LayoutNode[];
  readonly nodeMap: Map<string, LayoutNode>;
  readonly width: number;
  readonly height: number;
}

export class DeterministicGraphRenderer {
  public static readonly NODE_WIDTH = 220;
  public static readonly NODE_HEIGHT = 88;
  public static readonly X_GAP = 90;
  public static readonly Y_GAP = 45;
  public static readonly PADDING = 60;

  /**
   * Deterministically calculates node coordinates using a layered topological DAG layout.
   */
  public static computeLayout(ir: GraphPresentationIR): LayoutResult {
    const nodes = ir.nodes;
    const layoutNodes: LayoutNode[] = [];
    const nodeMap = new Map<string, LayoutNode>();

    if (nodes.length === 0) {
      return { layoutNodes, nodeMap, width: 800, height: 600 };
    }

    // Determine ranking / layers based on edge dependencies or natural pipeline order
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    for (const node of nodes) {
      inDegree.set(node.id, 0);
      adjacency.set(node.id, []);
    }

    for (const edge of ir.edges) {
      if (adjacency.has(edge.from) && inDegree.has(edge.to)) {
        adjacency.get(edge.from)!.push(edge.to);
        inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
      }
    }

    // Group into columns (ranks)
    const layers: PresentationNode[][] = [];
    let currentQueue = nodes.filter((n) => (inDegree.get(n.id) || 0) === 0);

    if (currentQueue.length === 0) {
      currentQueue = [nodes[0]];
    }

    const assigned = new Set<string>();
    const tempInDegree = new Map(inDegree);

    while (currentQueue.length > 0) {
      // Sort deterministically by label
      currentQueue.sort((a, b) => a.id.localeCompare(b.id));
      layers.push([...currentQueue]);

      const nextQueue: PresentationNode[] = [];
      for (const node of currentQueue) {
        assigned.add(node.id);
        for (const childId of adjacency.get(node.id) || []) {
          tempInDegree.set(childId, (tempInDegree.get(childId) || 0) - 1);
          if ((tempInDegree.get(childId) || 0) <= 0 && !assigned.has(childId)) {
            const childNode = nodes.find((n) => n.id === childId);
            if (childNode && !nextQueue.some((n) => n.id === childNode.id)) {
              nextQueue.push(childNode);
            }
          }
        }
      }
      currentQueue = nextQueue;
    }

    // Pick up any unassigned (e.g. disconnected or cycles)
    const unassigned = nodes.filter((n) => !assigned.has(n.id));
    if (unassigned.length > 0) {
      layers.push(unassigned);
    }

    // Assign (x, y) coordinates
    let maxX = 0;
    let maxY = 0;

    for (let col = 0; col < layers.length; col++) {
      const colNodes = layers[col];
      const x = this.PADDING + col * (this.NODE_WIDTH + this.X_GAP);

      for (let row = 0; row < colNodes.length; row++) {
        const node = colNodes[row];
        const y = this.PADDING + row * (this.NODE_HEIGHT + this.Y_GAP);

        const lNode: LayoutNode = {
          node,
          x,
          y,
          width: this.NODE_WIDTH,
          height: this.NODE_HEIGHT,
        };

        layoutNodes.push(lNode);
        nodeMap.set(node.id, lNode);

        if (x + this.NODE_WIDTH + this.PADDING > maxX) maxX = x + this.NODE_WIDTH + this.PADDING;
        if (y + this.NODE_HEIGHT + this.PADDING > maxY) maxY = y + this.NODE_HEIGHT + this.PADDING;
      }
    }

    return {
      layoutNodes,
      nodeMap,
      width: Math.max(900, maxX),
      height: Math.max(500, maxY),
    };
  }

  /**
   * Renders deterministic, accessible SVG markup.
   */
  public static renderSVG(ir: GraphPresentationIR): string {
    const layout = this.computeLayout(ir);
    const { width, height, layoutNodes, nodeMap } = layout;

    const svgLines: string[] = [];

    svgLines.push(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" class="factoryos-graph" role="img" aria-label="${ir.title}">`
    );

    // Defs: markers and filters
    svgLines.push(`  <defs>`);
    svgLines.push(`    <marker id="arrow-default" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">`);
    svgLines.push(`      <path d="M 0 0 L 8 4 L 0 8 Z" fill="#71717a" />`);
    svgLines.push(`    </marker>`);
    svgLines.push(`    <marker id="arrow-critical" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">`);
    svgLines.push(`      <path d="M 0 0 L 8 4 L 0 8 Z" fill="#ef4444" />`);
    svgLines.push(`    </marker>`);
    svgLines.push(`    <marker id="arrow-verified" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">`);
    svgLines.push(`      <path d="M 0 0 L 8 4 L 0 8 Z" fill="#10b981" />`);
    svgLines.push(`    </marker>`);
    svgLines.push(`    <filter id="focal-glow" x="-20%" y="-20%" width="140%" height="140%">`);
    svgLines.push(`      <feDropShadow dx="0" dy="0" stdDeviation="4" flood-color="#3b82f6" flood-opacity="0.6" />`);
    svgLines.push(`    </filter>`);
    svgLines.push(`    <filter id="alert-glow" x="-20%" y="-20%" width="140%" height="140%">`);
    svgLines.push(`      <feDropShadow dx="0" dy="0" stdDeviation="5" flood-color="#ef4444" flood-opacity="0.8" />`);
    svgLines.push(`    </filter>`);
    svgLines.push(`  </defs>`);

    // Background
    svgLines.push(`  <rect width="100%" height="100%" fill="${FactoryOSVisualTokens.colors.background}" />`);

    // Title & Header
    svgLines.push(`  <g class="graph-header" transform="translate(40, 35)">`);
    svgLines.push(`    <text x="0" y="0" font-family="monospace" font-size="16" font-weight="bold" fill="#f4f4f5">${escapeXml(ir.title)}</text>`);
    svgLines.push(`    <text x="0" y="18" font-family="monospace" font-size="11" fill="#a1a1aa">${escapeXml(ir.subtitle)}</text>`);
    svgLines.push(`  </g>`);

    // Render Edges
    svgLines.push(`  <g class="graph-edges">`);
    for (const edge of ir.edges) {
      const fromNode = nodeMap.get(edge.from);
      const toNode = nodeMap.get(edge.to);
      if (!fromNode || !toNode) continue;

      const x1 = fromNode.x + fromNode.width;
      const y1 = fromNode.y + fromNode.height / 2;
      const x2 = toNode.x;
      const y2 = toNode.y + toNode.height / 2;
      const dx = (x2 - x1) / 2;

      const path = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
      const isCritical = edge.status === "FAILED";
      const isVerified = edge.truthLevel === "VERIFIED" || edge.truthLevel === "PHYSICAL";
      const strokeColor = isCritical ? "#ef4444" : isVerified ? "#10b981" : "#52525b";
      const markerId = isCritical ? "arrow-critical" : isVerified ? "arrow-verified" : "arrow-default";
      const strokeDash = edge.visualHints.style === "dashed" ? 'stroke-dasharray="6,4"' : edge.visualHints.style === "dotted" ? 'stroke-dasharray="2,3"' : "";

      // Visible path
      svgLines.push(
        `    <path id="${edge.id}" data-edge-id="${edge.id}" data-canonical-id="${edge.id}" d="${path}" fill="none" stroke="${strokeColor}" stroke-width="${edge.visualHints.highlighted ? "2.5" : "1.5"}" ${strokeDash} marker-end="url(#${markerId})" class="edge-path" />`
      );
      // Accessible hit target for Explain Edge
      svgLines.push(
        `    <path id="${edge.id}_hit" data-edge-id="${edge.id}" data-canonical-id="${edge.id}" d="${path}" fill="none" stroke="transparent" stroke-width="14" class="edge-hit-target" cursor="pointer" role="button" tabindex="0" aria-label="Explain edge ${escapeXml(edge.id)}" />`
      );

      if (edge.label) {
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2 - 6;
        svgLines.push(
          `    <text x="${midX}" y="${midY}" text-anchor="middle" font-family="monospace" font-size="9" fill="#71717a" class="edge-label">${escapeXml(edge.label)}</text>`
        );
      }
    }
    svgLines.push(`  </g>`);

    // Render Nodes
    svgLines.push(`  <g class="graph-nodes">`);
    for (const lNode of layoutNodes) {
      const { node, x, y, width: w, height: h } = lNode;
      const statusColor = FactoryOSVisualTokens.colors.status[node.status] || "#71717a";
      const truthColor = FactoryOSVisualTokens.colors.truth[node.truthLevel] || "#71717a";
      const isCritical = node.visualHints.emphasis === "CRITICAL";
      const filterAttr = isCritical ? 'filter="url(#alert-glow)"' : node.visualHints.isFocal ? 'filter="url(#focal-glow)"' : "";
      const borderStroke = isCritical ? "#ef4444" : node.visualHints.isFocal ? "#3b82f6" : FactoryOSVisualTokens.colors.border;
      const strokeDash = node.truthLevel === "ASSERTED" || node.truthLevel === "INFERRED" ? 'stroke-dasharray="4,3"' : node.truthLevel === "UNKNOWN" ? 'stroke-dasharray="2,2"' : "";

      svgLines.push(
        `    <g id="${node.id}" data-node-id="${node.id}" data-canonical-id="${node.id}" data-node-type="${node.type}" data-status="${node.status}" data-truth="${node.truthLevel}" class="graph-node" transform="translate(${x}, ${y})" cursor="pointer" role="button" tabindex="0" aria-label="Node ${escapeXml(node.id)}: ${escapeXml(node.label)}" ${filterAttr}>`
      );
      // Card body
      svgLines.push(
        `      <rect width="${w}" height="${h}" rx="8" fill="${FactoryOSVisualTokens.colors.surface}" stroke="${borderStroke}" stroke-width="${isCritical || node.visualHints.isFocal ? "2" : "1"}" ${strokeDash} />`
      );
      // Status pill strip
      svgLines.push(
        `      <line x1="0" y1="${h - 4}" x2="${w}" y2="${h - 4}" stroke="${statusColor}" stroke-width="4" stroke-linecap="round" />`
      );
      // Header: Type badge & Truth badge
      svgLines.push(
        `      <text x="10" y="18" font-family="monospace" font-size="9" font-weight="bold" fill="#a1a1aa" letter-spacing="0.5">${escapeXml(node.type)}</text>`
      );
      svgLines.push(
        `      <text x="${w - 10}" y="18" text-anchor="end" font-family="monospace" font-size="9" font-weight="bold" fill="${truthColor}">${escapeXml(node.visualHints.badge || node.truthLevel)}</text>`
      );
      // Main Label
      svgLines.push(
        `      <text x="10" y="42" font-family="monospace" font-size="11" font-weight="bold" fill="#f4f4f5">${escapeXml(truncate(node.label, 26))}</text>`
      );
      // Status text + Evidence tag
      const evCount = node.evidenceRefs.length;
      const evText = evCount > 0 ? `• ${evCount} EV` : "";
      svgLines.push(
        `      <text x="10" y="64" font-family="monospace" font-size="9" fill="${statusColor}">${escapeXml(node.status)} ${escapeXml(evText)}</text>`
      );
      svgLines.push(`    </g>`);
    }
    svgLines.push(`  </g>`);

    svgLines.push(`</svg>`);
    return svgLines.join("\n");
  }

  /**
   * Generates a fully interactive standalone HTML viewer with Pan, Zoom, Inspector, and Search.
   */
  public static renderInteractiveHTML(ir: GraphPresentationIR): string {
    const svgContent = this.renderSVG(ir);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeXml(ir.title)} — FactoryOS Visual Inspector</title>
  <style>
    :root {
      --bg: #09090b;
      --surface: #18181b;
      --surface-elevated: #27272a;
      --border: #3f3f46;
      --text: #f4f4f5;
      --text-muted: #a1a1aa;
      --primary: #3b82f6;
      --danger: #ef4444;
      --success: #10b981;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      height: 100vh;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    header {
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      padding: 10px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 15px;
      z-index: 10;
    }
    .brand { font-size: 13px; font-weight: bold; letter-spacing: 1px; color: var(--text); }
    .brand span { color: var(--primary); }
    .toolbar { display: flex; align-items: center; gap: 8px; }
    .btn {
      background: var(--surface-elevated);
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 5px 12px;
      font-size: 11px;
      cursor: pointer;
      font-family: inherit;
    }
    .btn:hover { background: #3f3f46; }
    .btn.active { background: var(--primary); border-color: var(--primary); }
    .search-box {
      background: var(--surface-elevated);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 5px 10px;
      color: var(--text);
      font-size: 11px;
      font-family: inherit;
      width: 180px;
    }
    .layout-container {
      display: flex;
      flex: 1;
      overflow: hidden;
      position: relative;
    }
    .canvas-viewport {
      flex: 1;
      overflow: hidden;
      position: relative;
      cursor: grab;
      user-select: none;
      background: #09090b;
    }
    .canvas-viewport:active { cursor: grabbing; }
    .graph-transform-layer {
      transform-origin: 0 0;
      position: absolute;
      top: 0;
      left: 0;
    }
    .inspector-panel {
      width: 380px;
      background: var(--surface);
      border-left: 1px solid var(--border);
      padding: 20px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 15px;
      font-size: 12px;
      box-shadow: -4px 0 20px rgba(0,0,0,0.5);
      z-index: 5;
    }
    .panel-title { font-size: 12px; text-transform: uppercase; color: var(--text-muted); font-weight: bold; border-bottom: 1px solid var(--border); padding-bottom: 6px; }
    .info-row { display: flex; flex-direction: column; gap: 4px; }
    .info-label { font-size: 10px; color: var(--text-muted); text-transform: uppercase; }
    .info-val { font-size: 12px; color: var(--text); word-break: break-all; }
    .badge {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 10px;
      font-weight: bold;
    }
    .badge-truth { background: #3f3f46; color: #38bdf8; }
    .badge-status { background: #27272a; border: 1px solid var(--border); }
    .evidence-pill {
      background: #27272a;
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 6px 8px;
      margin-top: 4px;
      font-size: 11px;
    }
    .mismatch-banner {
      padding: 8px 10px;
      border-radius: 4px;
      font-size: 11px;
      line-height: 1.4;
      margin-top: 6px;
      border-left: 3px solid;
    }
    .mismatch-banner.size-mismatch {
      background: rgba(239, 68, 68, 0.15);
      border-color: #ef4444;
      color: #fca5a5;
    }
    .mismatch-banner.digest-mismatch {
      background: rgba(245, 158, 11, 0.15);
      border-color: #f59e0b;
      color: #fcd34d;
    }
    .mismatch-banner.receipt-mismatch {
      background: rgba(217, 70, 239, 0.15);
      border-color: #d946ef;
      color: #f0abfc;
    }
    .audit-card {
      background: #18181b;
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 10px;
      margin-top: 6px;
    }
    .audit-header {
      font-size: 10px;
      text-transform: uppercase;
      color: var(--text-muted);
      font-weight: bold;
      margin-bottom: 4px;
    }
    .audit-row {
      font-size: 11px;
      margin-bottom: 3px;
      display: flex;
      justify-content: space-between;
    }
    .audit-row span.label {
      color: var(--text-muted);
    }
    .audit-row span.val {
      font-family: monospace;
      font-weight: bold;
    }
    .graph-node:hover rect { stroke: var(--primary) !important; stroke-width: 2px !important; }
    .node-dimmed { opacity: 0.25; }
    .node-highlighted rect { stroke: #38bdf8 !important; stroke-width: 3px !important; }
  </style>
</head>
<body>
  <header>
    <div class="brand">FACTORY<span>OS</span> // GRAPH VISUALIZATION V1</div>
    <div class="toolbar">
      <input type="text" id="searchInput" class="search-box" placeholder="Search node ID or label..." aria-label="Search nodes" />
      <button class="btn" id="btnZoomIn">Zoom +</button>
      <button class="btn" id="btnZoomOut">Zoom -</button>
      <button class="btn" id="btnResetZoom">Reset</button>
      <button class="btn" id="btnToggleInspector">Inspector</button>
    </div>
  </header>

  <div class="layout-container">
    <div class="canvas-viewport" id="viewport">
      <div class="graph-transform-layer" id="graphContainer">
        ${svgContent}
      </div>
    </div>

    <aside class="inspector-panel" id="inspector">
      <div class="panel-title">Node & Evidence Inspector</div>
      <div id="inspectorContent">
        <p style="color: var(--text-muted); line-height: 1.5;">Click any graph node or edge to inspect canonical ID, truth level, evidence grounding, and upstream/downstream connections.</p>
      </div>
    </aside>
  </div>

  <script>
    const irData = ${JSON.stringify(ir)};

    // Pan & Zoom
    let scale = 1;
    let panX = 0;
    let panY = 0;
    let isDragging = false;
    let startX = 0;
    let startY = 0;

    const container = document.getElementById("graphContainer");
    const viewport = document.getElementById("viewport");
    const inspectorContent = document.getElementById("inspectorContent");

    function updateTransform() {
      container.style.transform = \`translate(\${panX}px, \${panY}px) scale(\${scale})\`;
    }

    viewport.addEventListener("mousedown", (e) => {
      if (e.target.closest(".graph-node")) return;
      isDragging = true;
      startX = e.clientX - panX;
      startY = e.clientY - panY;
    });

    window.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      panX = e.clientX - startX;
      panY = e.clientY - startY;
      updateTransform();
    });

    window.addEventListener("mouseup", () => { isDragging = false; });

    viewport.addEventListener("wheel", (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      scale = Math.max(0.2, Math.min(3, scale * zoomFactor));
      updateTransform();
    }, { passive: false });

    document.getElementById("btnZoomIn").addEventListener("click", () => { scale = Math.min(3, scale * 1.2); updateTransform(); });
    document.getElementById("btnZoomOut").addEventListener("click", () => { scale = Math.max(0.2, scale / 1.2); updateTransform(); });
    document.getElementById("btnResetZoom").addEventListener("click", () => { scale = 1; panX = 0; panY = 0; updateTransform(); });

    // Node and Edge Selection & Inspector
    const nodeElements = document.querySelectorAll(".graph-node");
    const edgeHitElements = document.querySelectorAll(".edge-hit-target");
    let currentSelection = { type: null, id: null };

    nodeElements.forEach(el => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const nodeId = el.getAttribute("data-canonical-id") || el.getAttribute("data-node-id");
        selectNode(nodeId);
      });
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          selectNode(el.getAttribute("data-canonical-id") || el.getAttribute("data-node-id"));
        }
      });
    });

    edgeHitElements.forEach(el => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const edgeId = el.getAttribute("data-canonical-id") || el.getAttribute("data-edge-id");
        selectEdge(edgeId);
      });
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          selectEdge(el.getAttribute("data-canonical-id") || el.getAttribute("data-edge-id"));
        }
      });
    });

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        clearSelection();
      }
    });

    function clearSelection() {
      currentSelection = { type: null, id: null };
      nodeElements.forEach(n => { n.classList.remove("node-highlighted", "node-dimmed"); });
      document.querySelectorAll(".edge-path").forEach(p => { p.setAttribute("stroke-width", "1.5"); });
      inspectorContent.innerHTML = '<p style="color: var(--text-muted); line-height: 1.5;">Click any graph node or edge to inspect canonical ID, truth level, evidence grounding, and upstream/downstream connections. Press [Esc] to clear selection, [Enter/Space] to inspect.</p>';
    }

    function selectNode(nodeId) {
      const node = irData.nodes.find(n => n.id === nodeId);
      if (!node) return;
      currentSelection = { type: "NODE", id: nodeId };

      // Highlight in SVG
      nodeElements.forEach(n => {
        if (n.getAttribute("data-canonical-id") === nodeId || n.getAttribute("data-node-id") === nodeId) {
          n.classList.add("node-highlighted");
          n.classList.remove("node-dimmed");
        } else {
          n.classList.remove("node-highlighted");
          n.classList.add("node-dimmed");
        }
      });

      // Render Inspector Content
      const evHtml = (node.evidenceRefs && node.evidenceRefs.length > 0)
        ? node.evidenceRefs.map(ev => '<div class="evidence-pill"><strong>' + escapeHtml(ev) + '</strong></div>').join("")
        : '<p style="color: var(--text-muted)">No direct evidence records linked.</p>';

      let artifactAuditHtml = '';
      const meta = node.metadata || {};
      const isArtifactNode = node.type === "ARTIFACT" || meta.byteLength !== undefined || meta.reportedByteLength !== undefined || meta.physicalByteLength !== undefined;
      if (isArtifactNode) {
        const physSize = meta.physicalByteLength !== undefined ? Number(meta.physicalByteLength).toLocaleString() + ' bytes' : null;
        const recSize = meta.receiptByteLength !== undefined ? Number(meta.receiptByteLength).toLocaleString() + ' bytes' : null;
        const repSize = meta.reportedByteLength !== undefined ? Number(meta.reportedByteLength).toLocaleString() + ' bytes' : (meta.byteLength !== undefined ? Number(meta.byteLength).toLocaleString() + ' bytes' : null);

        const physSha = meta.physicalSha256 || null;
        const recSha = meta.receiptSha256 || null;
        const repSha = meta.reportedSha256 || meta.sha256 || null;

        artifactAuditHtml += '<div class="info-row"><div class="info-label">Artifact Measurement Audit</div><div class="audit-card">';
        artifactAuditHtml += '<div class="audit-header">SIZE MEASUREMENTS</div>';
        if (physSize) artifactAuditHtml += '<div class="audit-row"><span class="label">PHYSICAL:</span><span class="val">' + escapeHtml(physSize) + '</span></div>';
        if (recSize) artifactAuditHtml += '<div class="audit-row"><span class="label">RECEIPT-BACKED:</span><span class="val">' + escapeHtml(recSize) + '</span></div>';
        if (repSize) artifactAuditHtml += '<div class="audit-row"><span class="label">REPORTED:</span><span class="val">' + escapeHtml(repSize) + '</span></div>';
        if (!physSize && !recSize && !repSize) artifactAuditHtml += '<div class="audit-row"><span class="label">SIZE:</span><span class="val">UNKNOWN</span></div>';

        artifactAuditHtml += '<div class="audit-header" style="margin-top:6px;">SHA-256 DIGEST</div>';
        if (physSha) artifactAuditHtml += '<div class="audit-row"><span class="label">PHYSICAL:</span><span class="val">' + escapeHtml(physSha) + '</span></div>';
        if (recSha) artifactAuditHtml += '<div class="audit-row"><span class="label">RECEIPT-BACKED:</span><span class="val">' + escapeHtml(recSha) + '</span></div>';
        if (repSha) artifactAuditHtml += '<div class="audit-row"><span class="label">REPORTED:</span><span class="val">' + escapeHtml(repSha) + '</span></div>';
        if (!physSha && !recSha && !repSha) artifactAuditHtml += '<div class="audit-row"><span class="label">SHA-256:</span><span class="val">UNKNOWN</span></div>';

        if (meta.sizeMismatchDetected || (physSize && repSize && physSize !== repSize)) {
          artifactAuditHtml += '<div class="mismatch-banner size-mismatch"><strong>SIZE MISMATCH</strong><br/>REPORTED: ' + escapeHtml(repSize || 'UNKNOWN') + '<br/>PHYSICAL: ' + escapeHtml(physSize || 'UNKNOWN') + '</div>';
        }
        if (meta.hashMismatchDetected || (physSha && repSha && physSha.toLowerCase() !== repSha.toLowerCase())) {
          artifactAuditHtml += '<div class="mismatch-banner digest-mismatch"><strong>DIGEST MISMATCH</strong><br/>REPORTED: ' + escapeHtml(repSha || 'UNKNOWN') + '<br/>PHYSICAL: ' + escapeHtml(physSha || 'UNKNOWN') + '</div>';
        }
        if (meta.receiptMismatchDetected) {
          artifactAuditHtml += '<div class="mismatch-banner receipt-mismatch"><strong>RECEIPT MISMATCH</strong><br/>RECEIPT: ' + escapeHtml(recSha || 'UNKNOWN') + '<br/>PHYSICAL: ' + escapeHtml(physSha || 'UNKNOWN') + '</div>';
        }
        artifactAuditHtml += '</div></div>';
      }

      inspectorContent.innerHTML = 
        '<div class="info-row">' +
          '<div class="info-label">Canonical Identity</div>' +
          '<div class="info-val"><strong data-testid="selected-canonical-id">' + escapeHtml(node.id) + '</strong></div>' +
        '</div>' +
        '<div class="info-row">' +
          '<div class="info-label">Node Label</div>' +
          '<div class="info-val">' + escapeHtml(node.label) + '</div>' +
        '</div>' +
        '<div class="info-row">' +
          '<div class="info-label">Type & Truth Level</div>' +
          '<div class="info-val">' +
            '<span class="badge badge-status">' + escapeHtml(node.type) + '</span> ' +
            '<span class="badge badge-truth">' + escapeHtml(node.truthLevel) + '</span> ' +
            '<span class="badge badge-status">' + escapeHtml(node.status) + '</span>' +
          '</div>' +
        '</div>' +
        artifactAuditHtml +
        '<div class="info-row">' +
          '<div class="info-label">Canonical Evidence Grounding (' + (node.evidenceRefs ? node.evidenceRefs.length : 0) + ')</div>' +
          '<div>' + evHtml + '</div>' +
        '</div>';
    }

    function selectEdge(edgeId) {
      const edge = irData.edges.find(e => e.id === edgeId);
      if (!edge) return;
      currentSelection = { type: "EDGE", id: edgeId };

      // Highlight in SVG
      document.querySelectorAll(".edge-path").forEach(p => {
        if (p.getAttribute("data-canonical-id") === edgeId || p.getAttribute("data-edge-id") === edgeId) {
          p.setAttribute("stroke-width", "3.5");
        } else {
          p.setAttribute("stroke-width", "1");
        }
      });

      const evHtml = (edge.evidenceRefs && edge.evidenceRefs.length > 0)
        ? edge.evidenceRefs.map(ev => '<div class="evidence-pill"><strong>' + escapeHtml(ev) + '</strong></div>').join("")
        : '<p style="color: var(--text-muted)">Grounded by mission execution telemetry.</p>';

      let edgeWarningHtml = '';
      if (edge.type === "EVIDENCE_SUPPORT" || (edge.metadata && edge.metadata.isPresentationOnly)) {
        edgeWarningHtml = 
          '<div class="info-row">' +
            '<div class="info-label">Presentation Warning</div>' +
            '<div class="info-val" style="color: #f59e0b; background: rgba(245, 158, 11, 0.1); padding: 8px; border-radius: 4px; border: 1px solid rgba(245, 158, 11, 0.3); font-size: 11px; line-height: 1.4;">' +
              '<strong>PRESENTATION RELATION:</strong> ' + escapeHtml((edge.metadata && edge.metadata.presentationRelation) || "Evidence shown because it supports selected subject") + '<br/>' +
              '<strong>AUTHORITATIVE RELATION:</strong> ' + escapeHtml((edge.metadata && edge.metadata.authoritativeRelation) || "EvidenceGraph relationship: PROVES_ARTIFACT_INTEGRITY") +
            '</div>' +
          '</div>';
      }

      inspectorContent.innerHTML = 
        '<div class="info-row">' +
          '<div class="info-label">Selected Edge</div>' +
          '<div class="info-val"><strong data-testid="selected-edge-id">' + escapeHtml(edge.id) + '</strong></div>' +
        '</div>' +
        '<div class="info-row">' +
          '<div class="info-label">Relationship</div>' +
          '<div class="info-val">' + escapeHtml(edge.from) + ' → ' + escapeHtml(edge.to) + '</div>' +
        '</div>' +
        '<div class="info-row">' +
          '<div class="info-label">Type & Truth Level</div>' +
          '<div class="info-val">' +
            '<span class="badge badge-status">' + escapeHtml(edge.type) + '</span> ' +
            '<span class="badge badge-truth">' + escapeHtml(edge.truthLevel) + '</span> ' +
            '<span class="badge badge-status">' + escapeHtml(edge.status) + '</span>' +
          '</div>' +
        '</div>' +
        edgeWarningHtml +
        '<div class="info-row">' +
          '<div class="info-label">Explain Edge (Authoritative Grounding)</div>' +
          '<div>' + evHtml + '</div>' +
        '</div>';
    }

    viewport.addEventListener("click", () => {
      clearSelection();
    });

    // Search filter
    document.getElementById("searchInput").addEventListener("input", (e) => {
      const term = e.target.value.trim().toLowerCase();
      if (!term) {
        nodeElements.forEach(n => n.classList.remove("node-dimmed", "node-highlighted"));
        return;
      }
      nodeElements.forEach(n => {
        const id = (n.getAttribute("data-canonical-id") || n.getAttribute("data-node-id") || "").toLowerCase();
        const text = n.textContent.toLowerCase();
        if (id.includes(term) || text.includes(term)) {
          n.classList.remove("node-dimmed");
          n.classList.add("node-highlighted");
        } else {
          n.classList.add("node-dimmed");
          n.classList.remove("node-highlighted");
        }
      });
    });

    function escapeHtml(str) {
      return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }
  </script>
</body>
</html>`;
  }

  /**
   * Generates a deterministic HTML inspector snippet for an artifact,
   * explicitly distinguishing PHYSICAL, RECEIPT-BACKED, REPORTED, and UNKNOWN measurements,
   * with explicit mismatch banners.
   */
  public static renderArtifactInspector(res: any): string {
    const lines: string[] = [];
    lines.push('<div class="audit-card">');
    lines.push('<div class="audit-header">SIZE MEASUREMENTS</div>');
    if (res.physicalByteLength !== undefined) {
      lines.push(`<div class="audit-row"><span class="label">PHYSICAL:</span><span class="val">${Number(res.physicalByteLength).toLocaleString()} bytes</span></div>`);
    }
    if (res.receiptByteLength !== undefined) {
      lines.push(`<div class="audit-row"><span class="label">RECEIPT-BACKED:</span><span class="val">${Number(res.receiptByteLength).toLocaleString()} bytes</span></div>`);
    }
    if (res.reportedByteLength !== undefined) {
      lines.push(`<div class="audit-row"><span class="label">REPORTED:</span><span class="val">${Number(res.reportedByteLength).toLocaleString()} bytes</span></div>`);
    }
    if (res.physicalByteLength === undefined && res.receiptByteLength === undefined && res.reportedByteLength === undefined) {
      lines.push('<div class="audit-row"><span class="label">SIZE:</span><span class="val">UNKNOWN</span></div>');
    }

    lines.push('<div class="audit-header" style="margin-top:6px;">SHA-256 DIGEST</div>');
    if (res.physicalSha256 !== undefined) {
      lines.push(`<div class="audit-row"><span class="label">PHYSICAL:</span><span class="val">${res.physicalSha256}</span></div>`);
    }
    if (res.receiptSha256 !== undefined) {
      lines.push(`<div class="audit-row"><span class="label">RECEIPT-BACKED:</span><span class="val">${res.receiptSha256}</span></div>`);
    }
    if (res.reportedSha256 !== undefined) {
      lines.push(`<div class="audit-row"><span class="label">REPORTED:</span><span class="val">${res.reportedSha256}</span></div>`);
    }
    if (res.physicalSha256 === undefined && res.receiptSha256 === undefined && res.reportedSha256 === undefined) {
      lines.push('<div class="audit-row"><span class="label">SHA-256:</span><span class="val">UNKNOWN</span></div>');
    }

    if (res.sizeMismatchDetected) {
      lines.push(`<div class="mismatch-banner size-mismatch"><strong>SIZE MISMATCH</strong><br/>REPORTED: ${res.reportedByteLength ?? "UNKNOWN"} bytes<br/>PHYSICAL: ${res.physicalByteLength ?? "UNKNOWN"} bytes</div>`);
    }
    if (res.hashMismatchDetected) {
      lines.push(`<div class="mismatch-banner digest-mismatch"><strong>DIGEST MISMATCH</strong><br/>REPORTED: ${res.reportedSha256 ?? "UNKNOWN"}<br/>PHYSICAL: ${res.physicalSha256 ?? "UNKNOWN"}</div>`);
    }
    if (res.receiptMismatchDetected) {
      lines.push(`<div class="mismatch-banner receipt-mismatch"><strong>RECEIPT MISMATCH</strong><br/>RECEIPT: ${res.receiptSha256 ?? "UNKNOWN"}<br/>PHYSICAL: ${res.physicalSha256 ?? "UNKNOWN"}</div>`);
    }
    lines.push('</div>');
    return lines.join("\n");
  }

  /**
   * Renders the complete visualization suite (SVG + HTML) to disk with post-render validation.
   */
  public static async renderArtifact(
    ir: GraphPresentationIR,
    outputDirectory: string = "data/evidence/visualizations"
  ): Promise<VisualizationReceipt> {
    const diagnostics: string[] = [];

    // 1. Validate Presentation IR
    const validation = GraphPresentationValidator.validate(ir);
    if (!validation.valid) {
      const lastGood = LastGoodVisualStore.getLastGood(ir.viewType, ir.missionId);
      return {
        schemaVersion: ir.schemaVersion || "1.0.0",
        missionId: ir.missionId,
        runId: ir.runId,
        viewType: ir.viewType,
        presentationHash: "",
        status: "FAILED",
        validationPassed: false,
        diagnostics: validation.errors,
        nodeCount: ir.nodes ? ir.nodes.length : 0,
        edgeCount: ir.edges ? ir.edges.length : 0,
        viewport: { width: 0, height: 0 },
        lastGoodReference: lastGood?.artifactPath,
        generatedAt: new Date().toISOString(),
      };
    }

    // 2. Ensure output directory
    const absOutDir = resolve(outputDirectory);
    if (!existsSync(absOutDir)) {
      mkdirSync(absOutDir, { recursive: true });
    }

    // 3. Compute deterministic presentation hash
    const presJson = JSON.stringify(ir);
    const presentationHash = createHash("sha256").update(presJson).digest("hex");

    // 4. Generate SVG & HTML
    const svg = this.renderSVG(ir);
    const html = this.renderInteractiveHTML(ir);

    const baseFilename = `${ir.missionId}_${ir.viewType.toLowerCase()}`;
    const svgPath = resolve(absOutDir, `${baseFilename}.svg`);
    const htmlPath = resolve(absOutDir, `${baseFilename}.html`);

    writeFileSync(svgPath, svg, "utf-8");
    writeFileSync(htmlPath, html, "utf-8");

    // 5. Post-render verification
    if (!existsSync(svgPath) || readFileSync(svgPath).length === 0) {
      diagnostics.push("SVG visual artifact missing or empty after render");
    }
    if (!existsSync(htmlPath) || readFileSync(htmlPath).length === 0) {
      diagnostics.push("HTML visual artifact missing or empty after render");
    }

    const svgHash = createHash("sha256").update(readFileSync(svgPath)).digest("hex");
    const htmlHash = createHash("sha256").update(readFileSync(htmlPath)).digest("hex");

    const layout = this.computeLayout(ir);
    const receipt: VisualizationReceipt = {
      schemaVersion: ir.schemaVersion,
      missionId: ir.missionId,
      runId: ir.runId,
      viewType: ir.viewType,
      presentationHash,
      artifactPath: svgPath,
      artifactHash: svgHash,
      htmlArtifactPath: htmlPath,
      htmlArtifactHash: htmlHash,
      status: diagnostics.length === 0 ? "DELIVERED" : "FAILED",
      validationPassed: diagnostics.length === 0,
      diagnostics,
      nodeCount: ir.nodes.length,
      edgeCount: ir.edges.length,
      viewport: { width: layout.width, height: layout.height },
      generatedAt: new Date().toISOString(),
    };

    if (receipt.status === "DELIVERED") {
      LastGoodVisualStore.commit(receipt);
    }

    return receipt;
  }
}

function escapeXml(unsafe: string): string {
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function truncate(str: string, len: number): string {
  return str.length > len ? str.substring(0, len - 1) + "…" : str;
}
