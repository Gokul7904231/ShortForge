#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.argv[2] ?? "knowledge");
const query = (process.argv[3] ?? "").trim().toLowerCase();
const limit = Number(process.argv[4] ?? 12);
const MAX_CHARS_PER_NOTE = 5000;

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

const candidates = walk(root).map(file => {
  const body = fs.readFileSync(file,"utf8");
  const rel = path.relative(root,file).replaceAll(path.sep,"/");
  const score = query ? body.toLowerCase().split(query).length - 1 : 1;
  return {relative:rel,body,score};
}).filter(x=>!query || x.score>0)
  .sort((a,b)=>b.score-a.score || a.relative.localeCompare(b.relative))
  .slice(0,Math.max(1,limit));

const projection = {
  generatedAt:new Date().toISOString(),
  query,
  bounded:true,
  notes:candidates.map(x=>({
    path:x.relative,
    matchScore:x.score,
    content:x.body.slice(0,MAX_CHARS_PER_NOTE),
  })),
};

console.log(JSON.stringify(projection,null,2));
