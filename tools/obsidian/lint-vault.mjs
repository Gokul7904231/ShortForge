#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.argv[2] ?? "knowledge");
const REQUIRED = [
  "id","type","title","status","sf_lifecycle","sf_epistemic_state",
  "sf_verification_state","created_at","updated_at",
];

const ALLOWED = {
  status: new Set(["draft","stable","deprecated"]),
  sf_lifecycle: new Set(["candidate","active","superseded","archived"]),
  sf_epistemic_state: new Set(["observed","sourced","inferred","hypothesized"]),
  sf_verification_state: new Set(["unverified","verified","disputed"]),
  sf_quality_state: new Set(["VALID","WARN","STALE","INCOMPLETE","CONTRADICTORY","UNVERIFIED","QUARANTINED"]),
};

const SECRET_PATTERNS = [
  /bearer\s+[a-zA-Z0-9_.-]{20,}/i,
  /(?:ghp|github_pat|gho|ghu|ghs|ghr)_[a-zA-Z0-9_]{20,}/i,
  /AIzaSy[a-zA-Z0-9_-]{20,}/i,
  /gsk_[a-zA-Z0-9]{20,}/i,
  /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/i,
  /INTERNAL_API_SECRET_KEY\s*=/i,
  /password\s*[:=]\s*["']/i,
];

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir,{withFileTypes:true})) {
    if ([".git",".obsidian","node_modules","generated"].includes(entry.name)) continue;
    const full = path.join(dir,entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile() && entry.name.endsWith(".md")) out.push(full);
  }
  return out;
}

function parseFrontmatter(text) {
  if (!text.startsWith("---\n")) return null;
  const end = text.indexOf("\n---",4);
  if (end < 0) return null;
  const block = text.slice(4,end);
  const values = {};
  for (const line of block.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (m) values[m[1]] = m[2].trim().replace(/^["']|["']$/g,"");
  }
  return {values,block};
}

const files = walk(root);
const seenIds = new Map();
const errors = [];
const warnings = [];

for (const file of files) {
  const rel = path.relative(root,file).replaceAll(path.sep,"/");
  const text = fs.readFileSync(file,"utf8");
  const parsed = parseFrontmatter(text);
  if (!parsed) {
    errors.push({file:rel,code:"MISSING_FRONTMATTER"});
    continue;
  }

  for (const key of REQUIRED) {
    if (!parsed.values[key]) errors.push({file:rel,code:"MISSING_PROPERTY",key});
  }

  for (const [key,allowed] of Object.entries(ALLOWED)) {
    if (parsed.values[key] && !allowed.has(parsed.values[key])) {
      errors.push({file:rel,code:"INVALID_PROPERTY",message:key+"="+parsed.values[key]});
    }
  }

  const id = parsed.values.id;
  if (id) {
    if (seenIds.has(id)) errors.push({file:rel,code:"DUPLICATE_ID",message:id+" already used by "+seenIds.get(id)});
    else seenIds.set(id,rel);
  }

  for (const rx of SECRET_PATTERNS) {
    if (rx.test(text)) warnings.push({file:rel,code:"SECRET_PATTERN",message:rx.source});
  }

  const trainingEligible = /(?:training_eligible|sf_training_eligible):\s*true/i.test(parsed.block);
  if (trainingEligible) {
    if (parsed.values.sf_verification_state !== "verified") {
      errors.push({file:rel,code:"TRAINING_UNVERIFIED"});
    }
    if (!/(evidence_refs|source_refs|sources|verified):/i.test(parsed.block)) {
      errors.push({file:rel,code:"TRAINING_NO_PROVENANCE"});
    }
  }

  if (parsed.values.sf_quality_state === "VALID" && parsed.values.sf_verification_state !== "verified") {
    warnings.push({file:rel,code:"VALID_WITHOUT_VERIFICATION"});
  }

  if (parsed.values.sf_memory_quality_score !== undefined) {
    const score = Number(parsed.values.sf_memory_quality_score);
    if (!Number.isFinite(score) || score < 0 || score > 1) {
      errors.push({file:rel,code:"INVALID_QUALITY_SCORE",message:String(parsed.values.sf_memory_quality_score)});
    }
  }

  if (parsed.values.sf_lifecycle === "superseded" && parsed.values.status === "stable") {
    warnings.push({file:rel,code:"SUPERSEDED_MARKED_STABLE"});
  }

  if (parsed.values.stale_after) {
    const staleAt = Date.parse(parsed.values.stale_after);
    if (Number.isFinite(staleAt) && staleAt < Date.now()) {
      warnings.push({file:rel,code:"STALE_MEMORY",message:parsed.values.stale_after});
    }
  }
}

const knownBasenames = new Set(files.map((file) => path.basename(file, ".md")));
for (const file of files) {
  const rel = path.relative(root,file).replaceAll(path.sep,"/");
  const text = fs.readFileSync(file,"utf8");
  const linkRegex = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;
  let match;
  while ((match = linkRegex.exec(text)) !== null) {
    const target = match[1].trim();
    if (!seenIds.has(target) && !knownBasenames.has(target)) {
      warnings.push({file:rel,code:"BROKEN_WIKILINK",message:target});
    }
  }
}

const activeConflictGroups = new Map();
for (const file of files) {
  const rel = path.relative(root,file).replaceAll(path.sep,"/");
  const text = fs.readFileSync(file,"utf8");
  const parsed = parseFrontmatter(text);
  if (!parsed) continue;
  if (parsed.values.sf_lifecycle !== "active" || !parsed.values.sf_conflict_group) continue;
  const group = parsed.values.sf_conflict_group;
  const list = activeConflictGroups.get(group) || [];
  list.push(rel);
  activeConflictGroups.set(group,list);
}
for (const [group, list] of activeConflictGroups.entries()) {
  if (list.length > 1) warnings.push({code:"ACTIVE_CONFLICT_GROUP",message:group+" => "+list.join(", ")});
}

const result = {
  root,
  files: files.length,
  ids: seenIds.size,
  errors,
  warnings,
  status: errors.length ? "BLOCKED" : "PASS",
};

console.log(JSON.stringify(result,null,2));
process.exitCode = errors.length ? 1 : 0;
