/**
 * ShortForge / FactoryOS — Intelligence CLI
 * Developer command surface for memory doctor, graph status/doctor/refresh, knowledge validate, and context preview.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { IntelligenceGateway } from "../IntelligenceGateway";

export class IntelligenceCli {
  private gateway: IntelligenceGateway;

  constructor(gateway?: IntelligenceGateway) {
    this.gateway = gateway || new IntelligenceGateway();
  }

  public async runCommand(args: string[]): Promise<string> {
    const [command, subcommand, ...rest] = args;

    if (command === "memory" && subcommand === "doctor") {
      const report = this.gateway.memoryDoctor();
      return [
        `=== FACTORY MEMORY DOCTOR ===`,
        `Overall Status: ${report.status}`,
        `Knowledge Documents: ${report.knowledge.validation.totalDocuments}`,
        `Knowledge Valid: ${report.knowledge.validation.valid ? "YES" : "NO"}`,
        `Secret Leaks: ${report.knowledge.validation.secretLeakErrors.length}`,
        `Structural Graph Nodes: ${report.structural.stats?.nodeCount || 0}`,
        `Structural Graph Edges: ${report.structural.stats?.edgeCount || 0}`,
      ].join("\n");
    }

    if (command === "graph" && subcommand === "status") {
      const stats = this.gateway.structuralGraph.getStats();
      return [
        `=== FACTORY GRAPH STATUS ===`,
        `Nodes: ${stats.nodeCount}`,
        `Edges: ${stats.edgeCount}`,
        `Extracted AST Edges: ${stats.extractedEdgesCount}`,
        `Inferred Edges: ${stats.inferredEdgesCount}`,
        `Communities: ${stats.communityCount}`,
        `Graphify Version: ${stats.graphifyVersion || "0.9.64"}`,
        `Snapshot ID: ${stats.snapshotId || "local"}`,
        `Source Commit: ${stats.sourceCommit || "HEAD"}`,
        `Dirty Worktree: ${stats.dirtyWorktree ? "YES" : "NO"}`,
      ].join("\n");
    }

    if (command === "graph" && subcommand === "doctor") {
      const report = this.gateway.structuralGraph.validate();
      return [
        `=== FACTORY GRAPH DOCTOR ===`,
        `Valid: ${report.valid ? "YES" : "NO"}`,
        `Total Nodes: ${report.totalNodes}`,
        `Total Edges: ${report.totalEdges}`,
        `Dangling Edges: ${report.danglingEdgeCount}`,
        `Extracted: ${report.extractedCount}`,
        `Inferred: ${report.inferredCount}`,
        report.errors.length > 0 ? `Errors:\n  - ${report.errors.join("\n  - ")}` : "No structural integrity errors.",
      ].join("\n");
    }

    if (command === "graph" && subcommand === "refresh") {
      // 1. Determine git revision and dirty status
      let commit = "HEAD";
      let isDirty = false;
      try {
        commit = execSync("git rev-parse HEAD", { encoding: "utf-8" }).trim();
        const status = execSync("git status --porcelain", { encoding: "utf-8" }).trim();
        isDirty = status.length > 0;
      } catch {
        commit = `snap-${Date.now()}`;
      }

      // 2. Discover graph.json source with configurable and relative paths
      let sourceGraph: string | null = null;
      const candidates = [
        process.env.GRAPHIFY_OUTPUT_PATH,
        path.resolve(process.cwd(), "graphify-out/graph.json"),
        path.resolve(process.cwd(), "graphify-out/graphify-out/graph.json"),
        path.resolve(process.cwd(), "..", "..", "graphify-out/graph.json"),
        path.resolve(process.cwd(), "..", "..", "graphify-out/graphify-out/graph.json"),
      ].filter((p): p is string => Boolean(p));

      for (const c of candidates) {
        if (fs.existsSync(c)) {
          sourceGraph = c;
          break;
        }
      }

      if (!sourceGraph) {
        return `Graph refresh failed: no source graph found. Run 'graphify extract . --code-only' first.`;
      }

      // 3. Fail closed on malformed graph JSON or schema incompatibility
      const rawGraphBytes = fs.readFileSync(sourceGraph);
      let parsedGraph: any;
      try {
        parsedGraph = JSON.parse(rawGraphBytes.toString("utf-8"));
      } catch (err) {
        return `Graph refresh failed: source graph at ${sourceGraph} is malformed JSON.`;
      }

      if (!parsedGraph || (!Array.isArray(parsedGraph.nodes) && !Array.isArray(parsedGraph.links))) {
        return `Graph refresh failed: source graph schema incompatible. Expected 'nodes' or 'links' arrays.`;
      }

      // 4. Compute graph content hash & dirty-aware immutable snapshot identity
      const graphHash = crypto.createHash("sha256").update(rawGraphBytes).digest("hex");
      const contentHashShort = graphHash.slice(0, 12);
      const snapshotId = isDirty ? `${commit}-dirty-${contentHashShort}` : commit;

      // 5. Persist versioned snapshot under .factoryos/structural/snapshots/<snapshot-id>/
      const snapshotDir = path.resolve(process.cwd(), ".factoryos", "structural", "snapshots", snapshotId);
      fs.mkdirSync(snapshotDir, { recursive: true });

      const destGraph = path.join(snapshotDir, "graph.json");
      fs.copyFileSync(sourceGraph, destGraph);

      const manifest = {
        graphify_version: "0.9.64",
        snapshot_id: snapshotId,
        source_commit: commit,
        dirty_worktree_state: isDirty,
        graph_hash: graphHash,
        generated_at: new Date().toISOString(),
        schema_version: "1.0",
      };
      fs.writeFileSync(path.join(snapshotDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf-8");

      // 6. Update current.json pointer
      const currentJson = path.resolve(process.cwd(), ".factoryos", "structural", "current.json");
      fs.writeFileSync(currentJson, JSON.stringify({ current_snapshot: snapshotId }, null, 2), "utf-8");

      return [
        `=== FACTORY GRAPH REFRESH ===`,
        `Snapshot ID: ${snapshotId}`,
        `Source Commit: ${commit}`,
        `Graph Hash: ${graphHash.slice(0, 16)}...`,
        `Dirty Worktree: ${isDirty ? "YES (changes uncommitted)" : "NO (clean)"}`,
        `Snapshot Path: ${destGraph}`,
        `Pointer Updated: ${currentJson}`,
      ].join("\n");
    }

    if (command === "memory" && subcommand === "fabric") {
      const mode = rest[0] === "ascalon" ? "ASCALON" : "AGENT";
      const query = rest.slice(1).join(" ");
      const projection = mode === "ASCALON"
        ? await this.gateway.memoryFabric.projectForAscalon(query)
        : await this.gateway.memoryFabric.projectForAgent(query);

      return [
        "=== MEMORY FABRIC PROJECTION ===",
        "Mode: " + projection.mode,
        "Query: " + JSON.stringify(projection.query),
        "Items: " + projection.itemCount,
        "Estimated Tokens: " + projection.estimatedTokens,
        ...projection.items.map((item) =>
          "- " + item.id + " | " + item.qualityState + " | " + item.verificationState + " | " + item.title
        ),
      ].join("\n");
    }

    if (command === "knowledge" && subcommand === "validate") {
      const report = this.gateway.knowledgeStore.validate();
      const okf = report.okfConformance;
      const sf = report.sfQuality;

      return [
        `=== FACTORY KNOWLEDGE VALIDATE ===`,
        `Overall Valid: ${report.valid ? "YES" : "NO"}`,
        `OKF v0.2 Spec Conformance: ${okf?.compliant ? "COMPLIANT" : "FAIL"}`,
        `ShortForge Quality Gate: ${sf?.passing ? "PASSING" : "FAIL"}`,
        `Total Documents: ${report.totalDocuments}`,
        `Duplicate IDs: ${report.duplicateIds.length}`,
        `Secret Leaks: ${report.secretLeakErrors.length}`,
        `Broken Internal Links: ${sf?.brokenInternalLinks.length || 0}`,
        report.errors.length > 0 ? `Errors:\n  - ${report.errors.join("\n  - ")}` : "Knowledge vault 100% OKF v0.2 compliant.",
      ].join("\n");
    }

    if (command === "context" && subcommand === "preview") {
      const query = rest.join(" ") || "What should I know before modifying the renderer?";
      const capsule = await this.gateway.compileContextForQuery({
        taskId: "cli-preview",
        query,
      });

      return [
        `=== CONTEXT CAPSULE PREVIEW ===`,
        `Query: "${capsule.query}"`,
        `Budget: ${capsule.budget.estimatedTokens}/${capsule.budget.maxTokens} tokens (Truncated: ${capsule.budget.wasTruncated})`,
        `Relevant Entities: ${capsule.relevantEntities.join(", ") || "None"}`,
        `Decisions: ${capsule.decisions.length}`,
        `Lessons: ${capsule.lessons.length}`,
        `Evidence Items: ${capsule.evidence.length}`,
        `Provenance: ${capsule.provenance.join(", ")}`,
      ].join("\n");
    }

    return `Unknown command: ${args.join(" ")}. Valid commands: memory doctor, graph status, graph doctor, graph refresh, knowledge validate, context preview [query]`;
  }
}
