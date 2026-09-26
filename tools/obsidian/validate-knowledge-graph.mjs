#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const pluginDir = path.resolve(process.argv[2] || "knowledge/.obsidian/plugins/shortforge-knowledge-graph");
const files = ["manifest.json","main.js","styles.css"].map(name => path.join(pluginDir,name));

for (const file of files) if (!fs.existsSync(file)) throw new Error("Missing graph asset: " + file);

const manifest = JSON.parse(fs.readFileSync(files[0],"utf8"));
if (manifest.id !== "shortforge-knowledge-graph") throw new Error("Unexpected graph plugin id");
if (manifest.name !== "ShortForge Knowledge Graph") throw new Error("Unexpected graph plugin name");
if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) throw new Error("Invalid graph plugin version");
if (String(manifest.description || "").length > 250) throw new Error("Graph plugin description exceeds 250 characters");

const js = fs.readFileSync(files[1],"utf8");
for (const token of ["registerView","sf_relations","SHORTFORGE KNOWLEDGE GRAPH","open-knowledge-graph"]) {
  if (!js.includes(token)) throw new Error("Graph runtime token missing: " + token);
}

const css = fs.readFileSync(files[2],"utf8");
for (const token of [".sfg-panel",".sfg-edge",".sfg-node-label",".sfg-toggle",".sfg-relation-chip"]) {
  if (!css.includes(token)) throw new Error("Graph CSS token missing: " + token);
}

console.log(JSON.stringify({
  status:"PASS",
  version:manifest.version,
  assets:files.map(file=>path.basename(file))
},null,2));
