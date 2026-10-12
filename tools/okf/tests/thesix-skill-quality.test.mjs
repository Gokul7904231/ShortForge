import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeSkillQuality } from "../thesix-skill-quality.mjs";

test("detects repeated long instruction bullets", () => {
  const instruction = "Inspect the canonical architecture and preserve worker permission boundaries before changing worker behavior."; 
  const content = "- " + instruction + "\n- " + instruction + "\nBLOCKED UNPROVEN";
  const result = analyzeSkillQuality(content, "CAP_NET_READ");
  assert.equal(result.duplicateInstructionCount, 1);
  assert.ok(result.issues.some((issue) => issue.code === "DUPLICATE_INSTRUCTION"));
});

test("fails closed on capability identifiers missing from the canonical permission matrix", () => {
  const result = analyzeSkillQuality("BLOCKED UNPROVEN CAP_NET_READ CAP_MADE_UP", "Known capability: CAP_NET_READ");
  assert.deepEqual(result.capabilityReferences, ["CAP_MADE_UP", "CAP_NET_READ"]);
  assert.ok(result.issues.some((issue) => issue.code === "UNDECLARED_CAPABILITY" && issue.message.includes("CAP_MADE_UP")));
});

test("requires an explicit capability declaration when a skill references capabilities", () => {
  const missing = analyzeSkillQuality("BLOCKED UNPROVEN CAP_NET_READ", "CAP_NET_READ");
  assert.ok(missing.issues.some((issue) => issue.code === "CAPABILITY_DECLARATION_MISSING"));

  const declared = analyzeSkillQuality(
    "BLOCKED UNPROVEN\n## Required Capabilities\n- CAP_NET_READ",
    "CAP_NET_READ",
  );
  assert.ok(!declared.issues.some((issue) => issue.code === "CAPABILITY_DECLARATION_MISSING"));
  assert.equal(declared.issues.length, 0);
});

test("enforces the context ceiling and blocked/unproven evidence semantics", () => {
  const result = analyzeSkillQuality("word ".repeat(21) + "CAP_NET_READ", "CAP_NET_READ", 20);
  assert.ok(result.issues.some((issue) => issue.code === "CONTEXT_BUDGET_EXCEEDED"));
  assert.ok(result.issues.some((issue) => issue.code === "EVIDENCE_SEMANTICS_MISSING"));
});

test("ignores short repeated labels and accepts canonical capabilities", () => {
  const content = "- License\n- License\nBLOCKED and UNPROVEN are explicit. CAP_NET_READ";
  const result = analyzeSkillQuality(content, "CAP_NET_READ");
  assert.equal(result.issues.length, 0);
  assert.deepEqual(result.capabilityReferences, ["CAP_NET_READ"]);
});
