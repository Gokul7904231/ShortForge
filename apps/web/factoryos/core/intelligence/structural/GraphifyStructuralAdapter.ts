/**
 * ShortForge / FactoryOS — Graphify Structural Adapter
 * Normalizes external Graphify AST node-link JSON into FactoryOS Structural Contracts.
 */

import fs from "node:fs";
import path from "node:path";
import {
  EdgeConfidence,
  GraphValidationReport,
  IStructuralGraphProvider,
  StructuralEdge,
  StructuralGraphStats,
  StructuralNode,
} from "./StructuralContracts";

interface RawGraphifyNode {
  id: string;
  label?: string;
  file_type?: string;
  source_file?: string;
  source_location?: string;
  community?: number;
  _callable?: boolean;
  [key: string]: unknown;
}

interface RawGraphifyLink {
  source: string;
  target: string;
  relation?: string;
  confidence?: string;
  confidence_score?: number;
  source_file?: string;
  source_location?: string;
  weight?: number;
  [key: string]: unknown;
}

interface RawGraphifyPayload {
  nodes?: RawGraphifyNode[];
  links?: RawGraphifyLink[];
  snapshot_id?: string;
  graphify_version?: string;
}

export class GraphifyStructuralAdapter implements IStructuralGraphProvider {
  private nodesMap: Map<string, StructuralNode> = new Map();
  private edgesList: StructuralEdge[] = [];
  private outEdgesMap: Map<string, StructuralEdge[]> = new Map();
  private inEdgesMap: Map<string, StructuralEdge[]> = new Map();
  private snapshotId?: string;
  private graphifyVersion?: string;

  constructor(payloadOrPath?: RawGraphifyPayload | string) {
    if (typeof payloadOrPath === "string") {
      this.loadFromFile(payloadOrPath);
    } else if (payloadOrPath) {
      this.loadFromPayload(payloadOrPath);
    }
  }

  public loadFromFile(filePath: string): void {
    const resolvedPath = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Graphify structural graph file not found: ${resolvedPath}`);
    }

    const content = fs.readFileSync(resolvedPath, "utf-8");
    const payload = JSON.parse(content) as RawGraphifyPayload;

    // Check for companion snapshot manifest (either manifest.json in same folder or ../snapshot_manifest.json)
    const sameDirManifest = path.join(path.dirname(resolvedPath), "manifest.json");
    const parentManifest = path.join(path.dirname(resolvedPath), "..", "snapshot_manifest.json");
    const manifestPath = fs.existsSync(sameDirManifest)
      ? sameDirManifest
      : fs.existsSync(parentManifest)
      ? parentManifest
      : null;

    if (manifestPath) {
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
        this.snapshotId = manifest.snapshot_id;
        this.graphifyVersion = manifest.graphify_version;
        (this as any).sourceCommit = manifest.source_commit;
        (this as any).dirtyWorktree = Boolean(manifest.dirty_worktree_state);
      } catch {
        // Ignored, optional metadata
      }
    }

    this.loadFromPayload(payload);
  }

  public loadFromPayload(payload: RawGraphifyPayload): void {
    this.nodesMap.clear();
    this.edgesList = [];
    this.outEdgesMap.clear();
    this.inEdgesMap.clear();

    if (payload.snapshot_id) this.snapshotId = payload.snapshot_id;
    if (payload.graphify_version) this.graphifyVersion = payload.graphify_version;

    // 1. Ingest & Normalize Nodes
    const rawNodes = payload.nodes || [];
    for (const raw of rawNodes) {
      if (!raw || !raw.id) continue;
      const node: StructuralNode = {
        id: String(raw.id),
        label: raw.label ? String(raw.label) : String(raw.id),
        type: raw.file_type ? String(raw.file_type) : "code",
        sourceFile: raw.source_file ? String(raw.source_file) : undefined,
        sourceLocation: raw.source_location ? String(raw.source_location) : undefined,
        community: typeof raw.community === "number" ? raw.community : undefined,
        isCallable: Boolean(raw._callable),
        properties: raw,
      };
      this.nodesMap.set(node.id, node);
      this.outEdgesMap.set(node.id, []);
      this.inEdgesMap.set(node.id, []);
    }

    // 2. Ingest & Normalize Edges (links)
    const rawLinks = payload.links || [];
    let edgeIdx = 0;
    for (const raw of rawLinks) {
      if (!raw || !raw.source || !raw.target) continue;

      const sourceId = String(raw.source);
      const targetId = String(raw.target);
      let confidence: EdgeConfidence = "UNKNOWN";
      if (raw.confidence === "EXTRACTED") {
        confidence = "EXTRACTED";
      } else if (raw.confidence === "INFERRED") {
        confidence = "INFERRED";
      } else {
        confidence = "UNKNOWN";
      }

      const edge: StructuralEdge = {
        id: `edge_${edgeIdx++}`,
        sourceId,
        targetId,
        relation: raw.relation ? String(raw.relation) : "connects",
        confidence,
        confidenceScore: typeof raw.confidence_score === "number" ? raw.confidence_score : undefined,
        sourceFile: raw.source_file ? String(raw.source_file) : undefined,
        sourceLocation: raw.source_location ? String(raw.source_location) : undefined,
        weight: typeof raw.weight === "number" ? raw.weight : 1.0,
        properties: raw,
      };

      this.edgesList.push(edge);

      if (!this.outEdgesMap.has(sourceId)) {
        this.outEdgesMap.set(sourceId, []);
      }
      this.outEdgesMap.get(sourceId)!.push(edge);

      if (!this.inEdgesMap.has(targetId)) {
        this.inEdgesMap.set(targetId, []);
      }
      this.inEdgesMap.get(targetId)!.push(edge);
    }
  }

  public getNode(id: string): StructuralNode | null {
    return this.nodesMap.get(id) || null;
  }

  public searchNodes(query: string, limit: number = 10): StructuralNode[] {
    const qLower = query.toLowerCase();
    const stopWords = new Set(["where", "what", "why", "how", "when", "did", "we", "the", "is", "are", "a", "an", "in", "on", "for", "of", "to", "and", "or", "implemented", "defined", "source", "code"]);
    const rawTokens = qLower.split(/[^a-z0-9_-]+/).filter((t) => t.length >= 3 && !stopWords.has(t));
    const tokens = rawTokens.length > 0 ? rawTokens : [qLower];

    const scored: Array<{ node: StructuralNode; score: number }> = [];

    for (const node of this.nodesMap.values()) {
      let score = 0;
      const idLower = node.id.toLowerCase();
      const labelLower = node.label.toLowerCase();
      const fileLower = node.sourceFile ? node.sourceFile.toLowerCase() : "";

      if (idLower.includes(qLower)) score += 50;
      if (labelLower.includes(qLower)) score += 30;

      for (const tok of tokens) {
        if (idLower.includes(tok)) score += 15;
        if (labelLower.includes(tok)) score += 10;
        if (fileLower.includes(tok)) score += 8;
      }

      if (score > 0) {
        scored.push({ node, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map((s) => s.node);
  }

  public getNeighbors(nodeId: string, direction: "in" | "out" | "both" = "both"): StructuralNode[] {
    const neighborIds = new Set<string>();

    if (direction === "out" || direction === "both") {
      const outEdges = this.outEdgesMap.get(nodeId) || [];
      for (const edge of outEdges) {
        neighborIds.add(edge.targetId);
      }
    }

    if (direction === "in" || direction === "both") {
      const inEdges = this.inEdgesMap.get(nodeId) || [];
      for (const edge of inEdges) {
        neighborIds.add(edge.sourceId);
      }
    }

    const neighbors: StructuralNode[] = [];
    for (const id of neighborIds) {
      const node = this.nodesMap.get(id);
      if (node) neighbors.push(node);
    }

    return neighbors;
  }

  public getEdges(nodeId: string, direction: "in" | "out" | "both" = "both"): StructuralEdge[] {
    const edges: StructuralEdge[] = [];
    if (direction === "out" || direction === "both") {
      edges.push(...(this.outEdgesMap.get(nodeId) || []));
    }
    if (direction === "in" || direction === "both") {
      edges.push(...(this.inEdgesMap.get(nodeId) || []));
    }
    return edges;
  }

  public findDependents(nodeId: string): StructuralNode[] {
    // Entities that point TO this node (incoming links)
    return this.getNeighbors(nodeId, "in");
  }

  public findDependencies(nodeId: string): StructuralNode[] {
    // Entities that this node points TO (outgoing links)
    return this.getNeighbors(nodeId, "out");
  }

  public findPath(startId: string, targetId: string, maxDepth: number = 6): StructuralNode[] | null {
    if (!this.nodesMap.has(startId) || !this.nodesMap.has(targetId)) return null;
    if (startId === targetId) return [this.nodesMap.get(startId)!];

    // BFS queue: [currentId, pathArray]
    const queue: Array<[string, string[]]> = [[startId, [startId]]];
    const visited = new Set<string>([startId]);

    while (queue.length > 0) {
      const [current, currentPath] = queue.shift()!;
      if (currentPath.length > maxDepth) continue;

      const outEdges = this.outEdgesMap.get(current) || [];
      for (const edge of outEdges) {
        const neighborId = edge.targetId;
        if (neighborId === targetId) {
          return [...currentPath, neighborId].map((id) => this.nodesMap.get(id)!);
        }

        if (!visited.has(neighborId)) {
          visited.add(neighborId);
          queue.push([neighborId, [...currentPath, neighborId]]);
        }
      }
    }

    return null;
  }

  public getStats(): StructuralGraphStats {
    let extracted = 0;
    let inferred = 0;
    const communities = new Set<number>();

    for (const edge of this.edgesList) {
      if (edge.confidence === "EXTRACTED") extracted++;
      else inferred++;
    }

    for (const node of this.nodesMap.values()) {
      if (typeof node.community === "number") {
        communities.add(node.community);
      }
    }

    return {
      nodeCount: this.nodesMap.size,
      edgeCount: this.edgesList.length,
      extractedEdgesCount: extracted,
      inferredEdgesCount: inferred,
      communityCount: communities.size,
      snapshotId: this.snapshotId,
      graphifyVersion: this.graphifyVersion,
      sourceCommit: (this as any).sourceCommit,
      dirtyWorktree: (this as any).dirtyWorktree,
    };
  }

  public validate(): GraphValidationReport {
    let dangling = 0;
    let extracted = 0;
    let inferred = 0;
    let unknownConfidence = 0;
    const errors: string[] = [];

    for (const edge of this.edgesList) {
      if (edge.confidence === "EXTRACTED") {
        extracted++;
      } else if (edge.confidence === "INFERRED") {
        inferred++;
      } else {
        unknownConfidence++;
        if (errors.length < 5) {
          errors.push(`Edge ${edge.id} has unknown or missing confidence semantics`);
        }
      }

      if (!this.nodesMap.has(edge.sourceId)) {
        dangling++;
        if (errors.length < 5) {
          errors.push(`Edge ${edge.id} references non-existent source: ${edge.sourceId}`);
        }
      }
      if (!this.nodesMap.has(edge.targetId)) {
        dangling++;
        if (errors.length < 5) {
          errors.push(`Edge ${edge.id} references non-existent target: ${edge.targetId}`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      totalNodes: this.nodesMap.size,
      totalEdges: this.edgesList.length,
      danglingEdgeCount: dangling,
      extractedCount: extracted,
      inferredCount: inferred,
      unknownConfidenceCount: unknownConfidence,
      errors,
    };
  }
}
