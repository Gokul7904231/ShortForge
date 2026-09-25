#!/usr/bin/env node
import fs from "node:fs";

const path = process.argv[2];
if (!path) { console.error("Usage: node Team/scripts/validate-team-report.mjs <report.json>"); process.exit(2); }
let report;
try { report = JSON.parse(fs.readFileSync(path, "utf8")); }
catch (error) { console.error("TEAM_CHANGE_GATE: BLOCKED"); console.error(String(error)); process.exit(1); }

const errors = [];
const required = ["schemaVersion","changeId","okf","classification","forgers","security","conflicts","disposition"];
for (const key of required) if (!(key in report)) errors.push("missing: " + key);
if (report.schemaVersion !== "1.0") errors.push("schemaVersion must be 1.0");
if (!["COMPLETE","INCIDENT_FOLLOWUP"].includes(report.okf?.sweepStatus)) errors.push("okf.sweepStatus must be COMPLETE or INCIDENT_FOLLOWUP");
const classes = ["already exists","extends existing rule","contradicts existing rule","new capability","experiment only"];
if (!classes.includes(report.classification)) errors.push("invalid classification");

if (!Array.isArray(report.conflicts)) {
  errors.push("conflicts must be an array");
} else {
  for (const c of report.conflicts) {
    for (const field of ["id","originalConflict","status","proposedResolution"]) {
      if (!c[field]) errors.push("conflict " + (c.id ?? "<unknown>") + " missing " + field);
    }
    if (c.status === "OPEN") errors.push("open conflict: " + (c.id ?? "<unknown>"));
  }
  if (report.classification === "contradicts existing rule" && report.conflicts.length === 0) {
    errors.push("contradiction classification requires a preserved conflict record");
  }
}

if (!["PASS","BLOCKED","REJECTED","ESCALATED"].includes(report.disposition)) errors.push("invalid disposition");
if (report.disposition === "PASS") {
  const failingSecurity = ["semgrep","strix","zap"].filter(k => ["FAIL","UNPROVEN","BLOCKED"].includes(report.security?.[k]));
  if (failingSecurity.length) errors.push("PASS cannot contain failing/unproven security states: " + failingSecurity.join(", "));
  if ((report.conflicts ?? []).some(c => c.status === "OPEN")) errors.push("PASS cannot contain OPEN conflicts");
}

if (errors.length) {
  console.error("TEAM_CHANGE_GATE: BLOCKED");
  for (const e of errors) console.error(" - " + e);
  process.exit(1);
}
console.log("TEAM_CHANGE_GATE: VALID");
