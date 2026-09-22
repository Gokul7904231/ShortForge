import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "crypto";
import { ProductionStage } from "../policy/YouTubePolicyIR";
import { EvidenceRef } from "../evidence/EvidenceRef";

export type ArtifactStatus = "VALID" | "INVALID" | "SUPERSEDED";

export interface ArtifactNode {
  readonly artifactId: string;
  readonly revision: number;
  readonly stage: ProductionStage;
  readonly sha256: string;
  readonly parentArtifactIds: readonly string[];
  readonly status: ArtifactStatus;
  readonly createdAt: string;
  readonly invalidatedAt?: string;
  readonly invalidationReason?: string;
  readonly associatedEvidenceRefs: readonly EvidenceRef[];
}

export class ArtifactLineageGraph {
  private nodes = new Map<string, ArtifactNode>();
  private childrenMap = new Map<string, Set<string>>();
  private storageFile: string | null = null;

  public constructor(storageFile?: string) {
    if (storageFile) {
      this.storageFile = storageFile;
      this.load();
    } else {
      const defaultDir = path.resolve(process.cwd(), "data");
      if (fs.existsSync(defaultDir)) {
        this.storageFile = path.join(defaultDir, "artifact_lineage.json");
        this.load();
      }
    }
  }

  private load(): void {
    if (!this.storageFile || !fs.existsSync(this.storageFile)) return;
    try {
      const raw = fs.readFileSync(this.storageFile, "utf8");
      const data = JSON.parse(raw);
      if (Array.isArray(data.nodes)) {
        for (const node of data.nodes) {
          this.nodes.set(node.artifactId, node);
          for (const parentId of node.parentArtifactIds || []) {
            if (!this.childrenMap.has(parentId)) {
              this.childrenMap.set(parentId, new Set());
            }
            this.childrenMap.get(parentId)!.add(node.artifactId);
          }
        }
      }
    } catch {
      // Non-blocking load
    }
  }

  private save(): void {
    if (!this.storageFile) return;
    try {
      const data = {
        updatedAt: new Date().toISOString(),
        nodes: Array.from(this.nodes.values()),
      };
      const dir = path.dirname(this.storageFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.storageFile, JSON.stringify(data, null, 2), "utf8");
    } catch {
      // Non-blocking save
    }
  }

  /**
   * Checks whether adding parent relationships would introduce a cycle into the DAG.
   */
  public wouldCreateCycle(artifactId: string, parentIds: readonly string[]): boolean {
    for (const parentId of parentIds) {
      if (parentId === artifactId) return true;
      const ancestors = this.getLineage(parentId);
      if (ancestors.some((a) => a.artifactId === artifactId)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Registers a new artifact in the lineage graph with cycle rejection.
   */
  public registerArtifact(params: {
    stage: ProductionStage;
    sha256: string;
    parentArtifactIds?: readonly string[];
    associatedEvidenceRefs?: readonly EvidenceRef[];
    artifactId?: string;
    revision?: number;
  }): ArtifactNode {
    const artifactId = params.artifactId || `art_${params.stage.toLowerCase()}_${crypto.randomUUID()}`;
    const parentIds = params.parentArtifactIds || [];

    // Cycle detection: Reject cyclic dependencies (e.g. A -> B -> C -> A)
    if (this.wouldCreateCycle(artifactId, parentIds)) {
      throw new Error(
        `[ArtifactLineageGraph] Cycle detected: Artifact '${artifactId}' would create a cycle in the lineage DAG with parents [${parentIds.join(", ")}]`
      );
    }

    const node: ArtifactNode = {
      artifactId,
      revision: params.revision ?? 1,
      stage: params.stage,
      sha256: params.sha256,
      parentArtifactIds: Object.freeze([...parentIds]),
      status: "VALID",
      createdAt: new Date().toISOString(),
      associatedEvidenceRefs: Object.freeze([...(params.associatedEvidenceRefs || [])]),
    };

    this.nodes.set(artifactId, node);

    // Update child references for DAG traversal
    for (const parentId of parentIds) {
      if (!this.childrenMap.has(parentId)) {
        this.childrenMap.set(parentId, new Set());
      }
      this.childrenMap.get(parentId)!.add(artifactId);
    }

    this.save();
    return node;
  }

  /**
   * Retrieves an artifact node by ID.
   */
  public getArtifact(artifactId: string): ArtifactNode | undefined {
    return this.nodes.get(artifactId);
  }

  /**
   * Checks whether an artifact is currently valid.
   */
  public isArtifactValid(artifactId: string): boolean {
    const node = this.nodes.get(artifactId);
    return node !== undefined && node.status === "VALID";
  }

  /**
   * Recursively cascades invalidation to an artifact and all its downstream children in the DAG.
   * Returns list of all invalidated artifact IDs.
   */
  public invalidateArtifact(artifactId: string, reason: string): readonly string[] {
    const invalidatedIds: string[] = [];
    const queue: string[] = [artifactId];
    const visited = new Set<string>();
    const now = new Date().toISOString();

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      if (visited.has(currentId)) {
        continue;
      }
      visited.add(currentId);

      const node = this.nodes.get(currentId);
      if (node && node.status === "VALID") {
        const updatedNode: ArtifactNode = {
          ...node,
          status: "INVALID",
          invalidatedAt: now,
          invalidationReason: reason,
        };
        this.nodes.set(currentId, updatedNode);
        invalidatedIds.push(currentId);
      }

      const children = this.childrenMap.get(currentId);
      if (children) {
        for (const childId of children) {
          queue.push(childId);
        }
      }
    }

    this.save();
    return Object.freeze(invalidatedIds);
  }

  /**
   * Invalidates all artifacts in the specified stage and all downstream artifacts depending on them.
   */
  public invalidateStage(stage: ProductionStage, reason: string): readonly string[] {
    const invalidatedIds: string[] = [];
    for (const node of this.nodes.values()) {
      if (node.stage === stage && node.status === "VALID") {
        const result = this.invalidateArtifact(node.artifactId, reason);
        for (const id of result) {
          if (!invalidatedIds.includes(id)) {
            invalidatedIds.push(id);
          }
        }
      }
    }
    return Object.freeze(invalidatedIds);
  }

  /**
   * Computes the complete lineage (ancestor chain) of an artifact back to root inputs.
   */
  public getLineage(artifactId: string): readonly ArtifactNode[] {
    const ancestors: ArtifactNode[] = [];
    const queue: string[] = [artifactId];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      if (visited.has(currentId)) continue;
      visited.add(currentId);

      const node = this.nodes.get(currentId);
      if (node) {
        ancestors.push(node);
        for (const parentId of node.parentArtifactIds) {
          queue.push(parentId);
        }
      }
    }

    return Object.freeze(ancestors);
  }

  /**
   * Returns all active valid artifact nodes.
   */
  public getValidArtifacts(): readonly ArtifactNode[] {
    return Object.freeze(Array.from(this.nodes.values()).filter((n) => n.status === "VALID"));
  }

  /**
   * Returns total node count in graph.
   */
  public get size(): number {
    return this.nodes.size;
  }
}
