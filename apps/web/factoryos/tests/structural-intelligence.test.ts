/**
 * FactoryOS — Structural Intelligence Tests
 * Verifies Graphify AST extraction normalization, queries, pathfinding, and validation.
 */

import { describe, it, expect } from "vitest";
import path from "path";
import fs from "fs";
import { GraphifyStructuralAdapter } from "../core/intelligence/structural/GraphifyStructuralAdapter";

describe("FactoryOS — Structural Intelligence (Graphify Adapter)", () => {
  const syntheticPayload = {
    snapshot_id: "test-snapshot-v1",
    graphify_version: "0.9.64",
    nodes: [
      {
        id: "apps_web_factoryos_overseer",
        label: "OverseerControlPlane",
        file_type: "code",
        source_file: "apps/web/factoryos/core/overseer/OverseerControlPlane.ts",
        source_location: "L25",
        community: 1,
        _callable: true,
      },
      {
        id: "apps_web_factoryos_render_queue",
        label: "SQLiteRenderQueue",
        file_type: "code",
        source_file: "apps/web/lib/core/SQLiteRenderQueue.ts",
        source_location: "L12",
        community: 2,
        _callable: true,
      },
      {
        id: "services_rendering_engine_basic_api",
        label: "BasicRenderAPI",
        file_type: "code",
        source_file: "services/rendering-engine/basic_render_api.py",
        source_location: "L40",
        community: 3,
        _callable: true,
      },
    ],
    links: [
      {
        source: "apps_web_factoryos_overseer",
        target: "apps_web_factoryos_render_queue",
        relation: "enqueues",
        confidence: "EXTRACTED",
        confidence_score: 1.0,
      },
      {
        source: "apps_web_factoryos_render_queue",
        target: "services_rendering_engine_basic_api",
        relation: "dispatches_to",
        confidence: "EXTRACTED",
        confidence_score: 1.0,
      },
    ],
  };

  it("loads and normalizes structural nodes and edges correctly", () => {
    const adapter = new GraphifyStructuralAdapter(syntheticPayload);
    const stats = adapter.getStats();

    expect(stats.nodeCount).toBe(3);
    expect(stats.edgeCount).toBe(2);
    expect(stats.extractedEdgesCount).toBe(2);
    expect(stats.inferredEdgesCount).toBe(0);
    expect(stats.snapshotId).toBe("test-snapshot-v1");
  });

  it("retrieves node details and searches nodes by substring", () => {
    const adapter = new GraphifyStructuralAdapter(syntheticPayload);

    const overseer = adapter.getNode("apps_web_factoryos_overseer");
    expect(overseer).not.toBeNull();
    expect(overseer?.label).toBe("OverseerControlPlane");
    expect(overseer?.sourceFile).toBe("apps/web/factoryos/core/overseer/OverseerControlPlane.ts");

    const searchResults = adapter.searchNodes("render");
    expect(searchResults.length).toBe(2);
  });

  it("finds dependencies and dependents accurately", () => {
    const adapter = new GraphifyStructuralAdapter(syntheticPayload);

    // Overseer enqueues to SQLiteRenderQueue -> render queue is a dependency of overseer
    const overseerDeps = adapter.findDependencies("apps_web_factoryos_overseer");
    expect(overseerDeps).toHaveLength(1);
    expect(overseerDeps[0].id).toBe("apps_web_factoryos_render_queue");

    // Overseer points to render queue -> overseer is a dependent of render queue
    const queueDependents = adapter.findDependents("apps_web_factoryos_render_queue");
    expect(queueDependents).toHaveLength(1);
    expect(queueDependents[0].id).toBe("apps_web_factoryos_overseer");
  });

  it("finds structural execution path between separated services", () => {
    const adapter = new GraphifyStructuralAdapter(syntheticPayload);

    // Path from Overseer -> SQLiteRenderQueue -> BasicRenderAPI
    const path = adapter.findPath("apps_web_factoryos_overseer", "services_rendering_engine_basic_api");
    expect(path).not.toBeNull();
    expect(path?.map((n) => n.id)).toEqual([
      "apps_web_factoryos_overseer",
      "apps_web_factoryos_render_queue",
      "services_rendering_engine_basic_api",
    ]);
  });

  it("loads and validates real Graphify snapshot from graphify-out/ if present", () => {
    const realGraphPath = path.resolve(process.cwd(), "graphify-out/graphify-out/graph.json");
    if (!fs.existsSync(realGraphPath)) {
      // In CI without prior extraction, skip real file check
      return;
    }

    const adapter = new GraphifyStructuralAdapter(realGraphPath);
    const stats = adapter.getStats();

    expect(stats.nodeCount).toBeGreaterThan(5000);
    expect(stats.edgeCount).toBeGreaterThan(10000);
    expect(stats.extractedEdgesCount).toBeGreaterThan(0);

    // Verify searching for core FactoryOS services returns real extracted symbols
    const overseerNodes = adapter.searchNodes("overseer", 5);
    expect(overseerNodes.length).toBeGreaterThan(0);

    const renderNodes = adapter.searchNodes("basic_render", 5);
    expect(renderNodes.length).toBeGreaterThan(0);
  });
});
