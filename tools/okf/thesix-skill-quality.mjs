/** Pure quality checks for the clean-room repository-assimilation skill. */
export function analyzeSkillQuality(skillContent, canonicalPermissionContent, maxWords = 1800) {
  if (!Number.isSafeInteger(maxWords) || maxWords < 1) {
    throw new Error("THESIX_SKILL_INVALID_WORD_LIMIT");
  }
  const issues = [];
  const wordCount = skillContent.trim() ? skillContent.trim().split(/\s+/).length : 0;
  if (wordCount > maxWords) {
    issues.push({
      code: "CONTEXT_BUDGET_EXCEEDED",
      message: "context budget exceeded (" + wordCount + " words; limit " + maxWords + ")",
    });
  }
  if (!/\bBLOCKED\b/i.test(skillContent) || !/\bUNPROVEN\b/i.test(skillContent)) {
    issues.push({
      code: "EVIDENCE_SEMANTICS_MISSING",
      message: "blocked/unproven evidence semantics must stay explicit",
    });
  }

  const canonicalCapabilities = new Set(canonicalPermissionContent.match(/\bCAP_[A-Z0-9_]+\b/g) || []);
  const capabilityReferences = [...new Set(skillContent.match(/\bCAP_[A-Z0-9_]+\b/g) || [])].sort();
  for (const capability of capabilityReferences) {
    if (!canonicalCapabilities.has(capability)) {
      issues.push({
        code: "UNDECLARED_CAPABILITY",
        message: "references capability " + capability + " which is absent from .okf/security/worker-permissions.md",
      });
    }
  }

  const seenInstructions = new Map();
  const lines = skillContent.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^\s*(?:\d+\.|[-*+])\s+(.+?)\s*$/);
    if (!match) continue;
    const normalized = match[1]
      .toLowerCase()
      .replace(/\[[^\]]+\]\([^)]+\)/g, " link ")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (normalized.length < 48) continue;
    const previousLine = seenInstructions.get(normalized);
    if (previousLine !== undefined) {
      issues.push({
        code: "DUPLICATE_INSTRUCTION",
        message: "duplicate long instruction at lines " + previousLine + " and " + (index + 1),
      });
    } else {
      seenInstructions.set(normalized, index + 1);
    }
  }

  return {
    wordCount,
    capabilityReferences,
    duplicateInstructionCount: issues.filter((issue) => issue.code === "DUPLICATE_INSTRUCTION").length,
    issues,
  };
}
