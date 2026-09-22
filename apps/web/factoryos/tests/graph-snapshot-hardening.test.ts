import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { GraphifyStructuralAdapter } from "../core/intelligence/structural/GraphifyStructuralAdapter";
import { IntelligenceCli } from "../core/intelligence/cli/IntelligenceCli";

describe("Graphify Snapshot & Confidence Semantics Hardening Suite", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "graphify-hardening-"));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("distinguishes EXTRACTED vs INFERRED vs UNKNOWN and does not fabricate 1.0 confidenceScore", () => {
    const payload = {
      nodes: [
        { id: "A", label: "Node A" },
        { id: "B", label: "Node B" },
        { id: "C", label: "Node C" },
      ],
      links: [
        {
          source: "A",
          target: "B",
          relation: "calls",
          confidence: "EXTRACTED",
          confidence_score: 0.95,
        },
        {
          source: "B",
          target: "C",
          relation: "references",
          confidence: "INFERRED",
          confidence_score: 0.65,
        },
        {
          source: "A",
          target: "C",
          relation: "connects",
          // missing confidence and missing score
        },
      ],
    };

    const adapter = new GraphifyStructuralAdapter(payload);
    const edges = adapter.getEdges("A", "out");

    const edgeAB = edges.find((e) => e.targetId === "B");
    expect(edgeAB?.confidence).toBe("EXTRACTED");
    expect(edgeAB?.confidenceScore).toBe(0.95);

    const edgeAC = edges.find((e) => e.targetId === "C");
    // Must be UNKNOWN, not defaulted to EXTRACTED!
    expect(edgeAC?.confidence).toBe("UNKNOWN");
    // Must be undefined, not fabricated to 1.0!
    expect(edgeAC?.confidenceScore).toBeUndefined();

    // Validation must report unknown confidence
    const report = adapter.validate();
    expect(report.valid).toBe(false);
    expect(report.unknownConfidenceCount).toBe(1);
    expect(report.errors.some((e) => e.includes("unknown or missing confidence"))).toBe(true);
  });

  it("fails closed on malformed graph JSON and schema incompatibility during graph refresh", async () => {
    const malformedGraphPath = path.join(tempDir, "malformed-graph.json");
    fs.writeFileSync(malformedGraphPath, "{ invalid json content: 123", "utf-8");

    process.env.GRAPHIFY_OUTPUT_PATH = malformedGraphPath;
    const cli = new IntelligenceCli();
    const result = await cli.runCommand(["graph", "refresh"]);

    expect(result).toContain("Graph refresh failed");
    expect(result).toContain("malformed JSON");

    // Incompatible schema
    const badSchemaPath = path.join(tempDir, "bad-schema.json");
    fs.writeFileSync(badSchemaPath, JSON.stringify({ wrongField: 42 }), "utf-8");

    process.env.GRAPHIFY_OUTPUT_PATH = badSchemaPath;
    const result2 = await cli.runCommand(["graph", "refresh"]);
    expect(result2).toContain("Graph refresh failed");
    expect(result2).toContain("schema incompatible");

    delete process.env.GRAPHIFY_OUTPUT_PATH;
  });
});
