import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { KnowledgeStore } from "../core/intelligence/knowledge/KnowledgeStore";
import { OKFParser } from "../core/intelligence/knowledge/OKFParser";

describe("KnowledgeStore & OKF Integrity Hardening Suite", () => {
  let tempVaultDir: string;

  beforeEach(() => {
    tempVaultDir = fs.mkdtempSync(path.join(os.tmpdir(), "okf-hardening-vault-"));
  });

  afterEach(() => {
    if (fs.existsSync(tempVaultDir)) {
      fs.rmSync(tempVaultDir, { recursive: true, force: true });
    }
  });

  it("detects duplicate document IDs across separate files before Map population", () => {
    const fileA = path.join(tempVaultDir, "doc-a.md");
    const fileB = path.join(tempVaultDir, "doc-b.md");

    const contentA = `---
id: duplicate-conflict-id
type: architecture
title: Document A
status: stable
---
First version.`;

    const contentB = `---
id: duplicate-conflict-id
type: architecture
title: Document B
status: stable
---
Second conflicting version with identical ID.`;

    fs.writeFileSync(fileA, contentA, "utf-8");
    fs.writeFileSync(fileB, contentB, "utf-8");

    const store = new KnowledgeStore(tempVaultDir);

    const dupErrors = store.getDuplicateIdErrors();
    expect(dupErrors.length).toBe(1);
    expect(dupErrors[0].id).toBe("duplicate-conflict-id");
    expect(dupErrors[0].filePaths).toHaveLength(2);

    const qualityReport = store.validateShortForgeKnowledgeQuality();
    expect(qualityReport.passing).toBe(false);
    expect(qualityReport.duplicateIds).toContain("duplicate-conflict-id");
    expect(qualityReport.errors.some((e) => e.includes("Duplicate ID: duplicate-conflict-id"))).toBe(true);
  });

  it("never silently ignores malformed documents and records parse error with path", () => {
    const validFile = path.join(tempVaultDir, "valid.md");
    const malformedFile = path.join(tempVaultDir, "broken.md");
    const noFrontmatterFile = path.join(tempVaultDir, "no-fm.md");

    fs.writeFileSync(
      validFile,
      `---
id: valid-doc
type: guide
title: Valid Guide
status: stable
---
Valid body.`,
      "utf-8"
    );

    fs.writeFileSync(
      malformedFile,
      `---
id: broken-doc
type: [unterminated list
title: Broken
---
Broken YAML syntax.`,
      "utf-8"
    );

    fs.writeFileSync(
      noFrontmatterFile,
      `Just raw markdown without frontmatter delimiter.`,
      "utf-8"
    );

    const store = new KnowledgeStore(tempVaultDir);

    const parseErrors = store.getParseErrors();
    expect(parseErrors.length).toBe(2);

    const errorPaths = parseErrors.map((p) => p.filePath);
    expect(errorPaths).toContain("broken.md");
    expect(errorPaths).toContain("no-fm.md");

    // The valid doc is still retrievable
    const validDoc = store.get("valid-doc");
    expect(validDoc).not.toBeNull();
    expect(validDoc?.frontmatter.title).toBe("Valid Guide");

    // Validation report surfaces the parse errors
    const okfReport = store.validateOKFConformance();
    expect(okfReport.compliant).toBe(false);
    expect(okfReport.errors.some((e) => e.includes("broken.md"))).toBe(true);
    expect(okfReport.errors.some((e) => e.includes("no-fm.md"))).toBe(true);
  });

  it("guarantees full YAML round-trip fidelity across strings, quotes, lists, nested records, and colons", () => {
    const originalDoc = {
      frontmatter: {
        id: "round-trip-spec",
        type: "architecture" as const,
        title: 'Architectural Decisions: "Hexagonal" & FactoryOS',
        description: "Contains: special characters, quotes, and colons: yes!",
        status: "stable" as const,
        tags: ["architecture", "okf-v0.2", "fidelity-test"],
        sources: [
          {
            id: "src-1",
            resource: "https://example.com/spec?q=1&v=2",
            title: "Original Spec: Volume I",
          },
        ],
        verified: [
          {
            by: "VerificationEngine",
            at: "2026-09-20T23:00:00Z",
            method: "automated-test",
          },
        ],
        sf_id: "round-trip-spec",
        sf_lifecycle: "active" as const,
        sf_epistemic_state: "observed" as const,
        sf_verification_state: "verified" as const,
        sf_confidence: 0.98,
        sf_domain: ["core", "intelligence"],
      },
      content: `## Section 1: Detailed Context\n\nThis is content with multiline text and code:\n\`\`\`ts\nconst a = 42;\n\`\`\``,
    };

    const serialized = OKFParser.stringify(originalDoc);
    expect(serialized).toContain("---");
    expect(serialized).toContain("type: architecture");
    expect(serialized).toContain('title: "Architectural Decisions: \\"Hexagonal\\" & FactoryOS"');

    const parsed = OKFParser.parse(serialized, "round-trip.md");
    expect(parsed.frontmatter.id).toBe(originalDoc.frontmatter.id);
    expect(parsed.frontmatter.type).toBe(originalDoc.frontmatter.type);
    expect(parsed.frontmatter.title).toBe(originalDoc.frontmatter.title);
    expect(parsed.frontmatter.description).toBe(originalDoc.frontmatter.description);
    expect(parsed.frontmatter.status).toBe(originalDoc.frontmatter.status);
    expect(parsed.frontmatter.tags).toEqual(originalDoc.frontmatter.tags);
    expect(parsed.frontmatter.sources).toEqual(originalDoc.frontmatter.sources);
    expect(parsed.frontmatter.verified).toEqual(originalDoc.frontmatter.verified);
    expect(parsed.content.trim()).toBe(originalDoc.content.trim());
  });
});
