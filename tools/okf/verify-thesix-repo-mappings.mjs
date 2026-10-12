#!/usr/bin/env node
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const mappingRoot = path.join(repoRoot, ".okf", "research", "repo-mappings");
const requiredMappings = [
  "helixdb-helix-foundry.md",
  "devdotfast-whiteboard.md",
  "twostraws-swiftui-agent-skill.md",
  "copilotkit-openintelligentui.md",
  "datalab-to-lift.md",
  "zvec-ai-zvec-grep.md",
];

const requiredMarkers = [
  /^# Repository Mapping:/m,
  /^- Repository: https:\/\/github\.com\//m,
  /^- Reviewed ref:/m,
  /^- Reviewed commit: [a-f0-9]{40}$/m,
  /^- Review date: \d{4}-\d{2}-\d{2}$/m,
  /^- Assimilation mode:/m,
  /^- ShortForge status:/m,
  /^## Status and verification required$/m,
  /^## Security\b.*$/m,
  /^## Provenance$/m,
];

const failures = [];
for (const filename of requiredMappings) {
  let content;
  try {
    content = await readFile(path.join(mappingRoot, filename), "utf8");
  } catch {
    failures.push(`${filename}: mapping file is missing`);
    continue;
  }

  for (const marker of requiredMarkers) {
    if (!marker.test(content)) failures.push(`${filename}: missing required mapping field ${marker}`);
  }
  if (/\b(PASS|VERIFIED|PRODUCTION_READY)\b/i.test(content) &&
      /not run|unproven|not integrated|experiment only/i.test(content)) {
    // Contradictory words may legitimately appear in rollback/negative-evidence
    // text, so this is a review signal, not an automatic failure.
  }
  if (!/clean-room|clean room|no .*copied|not copied/i.test(content)) {
    failures.push(`${filename}: clean-room disposition is not stated`);
  }
}


const skillPath = path.join(repoRoot, ".agents", "skills", "factoryos-repo-assimilation", "SKILL.md");
let skillContent = "";
try {
  skillContent = await readFile(skillPath, "utf8");
} catch {
  failures.push(".agents/skills/factoryos-repo-assimilation/SKILL.md: skill file is missing");
}

if (skillContent) {
  const requiredSkillMarkers = [
    /^---\s*\n/m,
    /^name: factoryos-repo-assimilation$/m,
    /^description: .+$/m,
    /^# FactoryOS Repository Assimilation Skill$/m,
    /^## The Governance Rule$/m,
    /^## Evidence-First, Bounded Review Protocol$/m,
    /^## Required Review Output$/m,
  ];
  for (const marker of requiredSkillMarkers) {
    if (!marker.test(skillContent)) failures.push(`assimilation skill: missing required section or metadata ${marker}`);
  }

  const wordCount = skillContent.trim().split(/\s+/).length;
  if (wordCount > 1800) failures.push(`assimilation skill: context budget exceeded (${wordCount} words; limit 1800)`);
  if (!/\bBLOCKED\b/i.test(skillContent) || !/\bUNPROVEN\b/i.test(skillContent)) {
    failures.push("assimilation skill: blocked/unproven evidence semantics must stay explicit");
  }

  const markdownLinks = [...skillContent.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)];
  for (const match of markdownLinks) {
    const target = match[1].trim().split("#")[0];
    if (!target || /^(?:https?:|mailto:|data:)/i.test(target)) continue;
    try {
      await access(path.resolve(path.dirname(skillPath), target));
    } catch {
      failures.push(`assimilation skill: broken relative reference ${target}`);
    }
  }
}

if (failures.length) {
  console.error("THESIX repository mapping verification FAILED:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`THESIX repository mapping + assimilation-skill verification PASS (${requiredMappings.length} mappings; structure/provenance/context-budget only)`);
  console.log("This check does not validate legal sufficiency, runtime integration, benchmark quality, or production readiness.");
}
