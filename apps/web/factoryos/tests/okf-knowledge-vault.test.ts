/**
 * FactoryOS — OKF Knowledge Vault Tests
 * Verifies OKF parser, KnowledgeStore CRUD, atomic writes, and validation.
 */

import { describe, it, expect, beforeEach } from "vitest";
import path from "path";
import fs from "fs";
import { OKFParser } from "../core/intelligence/knowledge/OKFParser";
import { KnowledgeStore } from "../core/intelligence/knowledge/KnowledgeStore";
import { OKFFrontmatter } from "../core/intelligence/knowledge/OKFContracts";

describe("FactoryOS — OKF Knowledge Vault", () => {
  const testVaultDir = path.resolve(process.cwd(), "temp/test-vault");

  beforeEach(() => {
    if (fs.existsSync(testVaultDir)) {
      fs.rmSync(testVaultDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testVaultDir, { recursive: true });
  });

  it("parses valid OKF Markdown frontmatter and body", () => {
    const raw = `---
id: test-decision-001
type: decision
title: Use Warm Pool for Rendering
status: active
epistemic_state: sourced
verification: verified
created_at: 2026-09-20T12:00:00Z
updated_at: 2026-09-20T12:00:00Z
tags:
  - rendering
  - fast-path
provenance:
  source_type: USER_DECISION
  source_id: user-cmd-01
  captured_at: 2026-09-20T12:00:00Z
---

# Decision Content
Warm pool on port 8100 guarantees sub-60s short generation.
`;

    const doc = OKFParser.parse(raw, "decisions/test-decision-001.md");
    expect(doc.frontmatter.id).toBe("test-decision-001");
    expect(doc.frontmatter.type).toBe("decision");
    expect(doc.frontmatter.tags).toEqual(["rendering", "fast-path"]);
    expect(doc.frontmatter.provenance?.source_type).toBe("USER_DECISION");
    expect(doc.content).toContain("# Decision Content");
  });

  it("serializes OKF document back to standard Markdown", () => {
    const fm: OKFFrontmatter = {
      id: "adr-sample",
      type: "decision",
      title: "Sample Decision",
      status: "active",
      created_at: "2026-09-20T10:00:00Z",
      updated_at: "2026-09-20T10:00:00Z",
      tags: ["sample"],
    };

    const serialized = OKFParser.stringify({
      frontmatter: fm,
      content: "Body text here.",
    });

    expect(serialized).toContain("---");
    expect(serialized).toContain("id: adr-sample");
    expect(serialized).toContain("Body text here.");
  });

  it("creates, retrieves, supersedes, and searches documents in KnowledgeStore", async () => {
    const store = new KnowledgeStore(testVaultDir);

    const doc = await store.create({
      frontmatter: {
        id: "decision-fastapi",
        type: "decision",
        title: "FastAPI Execution Workers",
        status: "active",
        created_at: "2026-09-20T10:00:00Z",
        updated_at: "2026-09-20T10:00:00Z",
        tags: ["rendering", "python"],
      },
      content: "FastAPI handles video generation tasks efficiently.",
      subDir: "decisions",
    });

    expect(doc.filePath).toBe("decisions/decision-fastapi.md");

    const retrieved = store.get("decision-fastapi");
    expect(retrieved).not.toBeNull();
    expect(retrieved?.frontmatter.title).toBe("FastAPI Execution Workers");

    const searchResults = store.search("FastAPI");
    expect(searchResults).toHaveLength(1);

    // Supersede document
    await store.supersede("decision-fastapi", "decision-v2", "Migrating to new worker specification");
    const updated = store.get("decision-fastapi");
    expect(updated?.frontmatter.sf_lifecycle).toBe("superseded");
    expect(updated?.frontmatter.status).toBe("deprecated");
    expect(updated?.frontmatter.superseded_by).toBe("decision-v2");
  });

  it("loads and validates the real repository knowledge vault", () => {
    const store = new KnowledgeStore();

    const docs = store.list();
    expect(docs.length).toBeGreaterThanOrEqual(4);

    const adr = store.get("ADR-001-structural-intelligence-knowledge-vault");
    expect(adr).not.toBeNull();
    expect(adr?.frontmatter.type).toBe("decision");

    const report = store.validate();
    expect(report.valid).toBe(true);
    expect(report.duplicateIds).toHaveLength(0);
    expect(report.secretLeakErrors).toHaveLength(0);
  });
});
