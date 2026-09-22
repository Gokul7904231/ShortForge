/**
 * ShortForge / FactoryOS — OKF Frontmatter & Markdown Parser
 * Deterministically parses and formats Markdown files with YAML frontmatter.
 * Adheres to OKF v0.2 specification and ShortForge sf_* extension conventions.
 */

import { OKFFrontmatter, KnowledgeDocument } from "./OKFContracts";

export class OKFParser {
  /**
   * Parse raw Markdown text containing YAML frontmatter between leading `---` markers.
   */
  public static parse(rawContent: string, filePath: string = "unknown"): KnowledgeDocument {
    const trimmed = rawContent.trimStart();
    if (!trimmed.startsWith("---")) {
      throw new Error(`File ${filePath} is missing leading YAML frontmatter '---' delimiter.`);
    }

    const firstEnd = trimmed.indexOf("\n---", 3);
    if (firstEnd === -1) {
      throw new Error(`File ${filePath} has unclosed YAML frontmatter.`);
    }

    const yamlBlock = trimmed.slice(3, firstEnd).trim();
    const markdownBody = trimmed.slice(firstEnd + 4).trimStart();
    const frontmatter = this.parseSimpleYaml(yamlBlock);

    // Normalize id if omitted or stored in sf_id
    if (!frontmatter.id) {
      if (frontmatter.sf_id) {
        (frontmatter as Record<string, unknown>).id = frontmatter.sf_id;
      } else {
        // Derive from filename
        const base = filePath.split("/").pop()?.replace(/\.md$/, "") || "doc";
        (frontmatter as Record<string, unknown>).id = base;
      }
    }

    return {
      frontmatter,
      content: markdownBody,
      filePath,
    };
  }

  /**
   * Serialize an OKF Document back to standard Markdown with YAML frontmatter.
   * Emits standard OKF fields first, then ShortForge sf_* extension fields.
   */
  public static stringify(doc: { frontmatter: OKFFrontmatter; content: string }): string {
    const yamlLines: string[] = ["---"];
    const fm = doc.frontmatter;

    // --- 1. Standard OKF Fields ---
    yamlLines.push(`type: ${fm.type}`);
    if (fm.title) yamlLines.push(`title: ${this.escapeYamlString(fm.title)}`);
    if (fm.description) yamlLines.push(`description: ${this.escapeYamlString(fm.description)}`);
    if (fm.resource) yamlLines.push(`resource: ${this.escapeYamlString(fm.resource)}`);

    // Standard OKF status: draft, stable, deprecated
    // If standard status exists, write it; otherwise default to stable or map from sf_lifecycle
    const standardStatus = fm.status || (fm.sf_lifecycle === "archived" ? "deprecated" : "stable");
    yamlLines.push(`status: ${standardStatus}`);

    if (fm.stale_after) yamlLines.push(`stale_after: ${fm.stale_after}`);

    if (fm.tags && Array.isArray(fm.tags) && fm.tags.length > 0) {
      yamlLines.push("tags:");
      for (const tag of fm.tags) {
        yamlLines.push(`  - ${tag}`);
      }
    }

    if (fm.sources && Array.isArray(fm.sources) && fm.sources.length > 0) {
      yamlLines.push("sources:");
      for (const src of fm.sources) {
        yamlLines.push(`  - id: ${src.id}`);
        yamlLines.push(`    resource: ${this.escapeYamlString(src.resource)}`);
        if (src.title) yamlLines.push(`    title: ${this.escapeYamlString(src.title)}`);
      }
    }

    if (fm.generated) {
      yamlLines.push("generated:");
      yamlLines.push(`  by: ${fm.generated.by}`);
      yamlLines.push(`  at: ${fm.generated.at}`);
      if (fm.generated.tool) yamlLines.push(`  tool: ${fm.generated.tool}`);
    }

    if (fm.verified && Array.isArray(fm.verified) && fm.verified.length > 0) {
      yamlLines.push("verified:");
      for (const ver of fm.verified) {
        yamlLines.push(`  - by: ${ver.by}`);
        yamlLines.push(`    at: ${ver.at}`);
        if (ver.method) yamlLines.push(`    method: ${ver.method}`);
      }
    }

    // --- 2. ShortForge Extension Fields (sf_*) ---
    const sfId = fm.sf_id || fm.id;
    yamlLines.push(`id: ${sfId}`);
    yamlLines.push(`sf_id: ${sfId}`);

    const sfLifecycle = fm.sf_lifecycle || (fm.status === "deprecated" ? "archived" : "active");
    yamlLines.push(`sf_lifecycle: ${sfLifecycle}`);

    const sfEpistemic = fm.sf_epistemic_state || fm.epistemic_state || "sourced";
    yamlLines.push(`sf_epistemic_state: ${sfEpistemic}`);

    const sfVerif = fm.sf_verification_state || fm.verification || "verified";
    yamlLines.push(`sf_verification_state: ${sfVerif}`);

    // Backwards-compat mirror fields
    if (fm.epistemic_state) yamlLines.push(`epistemic_state: ${fm.epistemic_state}`);
    if (fm.verification) yamlLines.push(`verification: ${fm.verification}`);

    const createdAt = fm.created_at || new Date().toISOString();
    const updatedAt = fm.updated_at || createdAt;
    yamlLines.push(`created_at: ${createdAt}`);
    yamlLines.push(`updated_at: ${updatedAt}`);

    const validFrom = fm.sf_valid_from || fm.valid_from;
    if (validFrom) {
      yamlLines.push(`sf_valid_from: ${validFrom}`);
      yamlLines.push(`valid_from: ${validFrom}`);
    }

    const validUntil = fm.sf_valid_until || fm.valid_until;
    if (validUntil) {
      yamlLines.push(`sf_valid_until: ${validUntil}`);
      yamlLines.push(`valid_until: ${validUntil}`);
    }

    const occurredAt = fm.sf_occurred_at || fm.occurred_at;
    if (occurredAt) {
      yamlLines.push(`sf_occurred_at: ${occurredAt}`);
      yamlLines.push(`occurred_at: ${occurredAt}`);
    }

    const supersededBy = fm.sf_superseded_by || fm.superseded_by;
    if (supersededBy) {
      yamlLines.push(`sf_superseded_by: ${supersededBy}`);
      yamlLines.push(`superseded_by: ${supersededBy}`);
    }

    const prov = fm.sf_provenance || fm.provenance;
    if (prov) {
      yamlLines.push("sf_provenance:");
      yamlLines.push(`  source_type: ${prov.source_type}`);
      yamlLines.push(`  source_id: ${prov.source_id}`);
      if (prov.path) yamlLines.push(`  path: ${prov.path}`);
      if (typeof prov.start_line === "number") yamlLines.push(`  start_line: ${prov.start_line}`);
      if (typeof prov.end_line === "number") yamlLines.push(`  end_line: ${prov.end_line}`);
      yamlLines.push(`  captured_at: ${prov.captured_at}`);

      yamlLines.push("provenance:");
      yamlLines.push(`  source_type: ${prov.source_type}`);
      yamlLines.push(`  source_id: ${prov.source_id}`);
      if (prov.path) yamlLines.push(`  path: ${prov.path}`);
      if (typeof prov.start_line === "number") yamlLines.push(`  start_line: ${prov.start_line}`);
      if (typeof prov.end_line === "number") yamlLines.push(`  end_line: ${prov.end_line}`);
      yamlLines.push(`  captured_at: ${prov.captured_at}`);
    }

    yamlLines.push("---");
    yamlLines.push("");
    yamlLines.push(doc.content);

    return yamlLines.join("\n");
  }

  /**
   * Deterministic simple YAML parser handling strings, lists, numbers, and nested objects.
   */
  private static parseSimpleYaml(yamlStr: string): OKFFrontmatter {
    const lines = yamlStr.split("\n");
    const result: Record<string, unknown> = {};
    let currentKey = "";
    let currentList: unknown[] | null = null;
    let currentObj: Record<string, unknown> | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim() || line.trim().startsWith("#")) continue;

      const indent = line.search(/\S|$/);
      const trimmed = line.trim();

      if (indent === 0) {
        // Flush previous structures
        if (currentList && currentKey) {
          result[currentKey] = currentList;
          currentList = null;
        }
        if (currentObj && currentKey) {
          result[currentKey] = currentObj;
          currentObj = null;
        }

        const colonIdx = trimmed.indexOf(":");
        if (colonIdx !== -1) {
          const key = trimmed.slice(0, colonIdx).trim();
          const value = trimmed.slice(colonIdx + 1).trim();

          currentKey = key;
          if (value === "") {
            // Next lines may be a list or an object
            currentList = null;
            currentObj = null;
          } else {
            result[key] = this.parseScalar(value);
          }
        }
      } else if (indent > 0) {
        if (trimmed.startsWith("- ")) {
          if (!currentList) currentList = [];
          const itemVal = trimmed.slice(2).trim();
          if (itemVal.includes(":")) {
            // Item is an object in list e.g. - id: x
            const cIdx = itemVal.indexOf(":");
            const subKey = itemVal.slice(0, cIdx).trim();
            const subVal = itemVal.slice(cIdx + 1).trim();
            const objItem: Record<string, unknown> = { [subKey]: this.parseScalar(subVal) };
            currentList.push(objItem);
          } else {
            currentList.push(this.parseScalar(itemVal));
          }
        } else if (trimmed.includes(":")) {
          const cIdx = trimmed.indexOf(":");
          const k = trimmed.slice(0, cIdx).trim();
          const v = trimmed.slice(cIdx + 1).trim();

          // If inside a list where previous entry is an object, attach property
          if (currentList && currentList.length > 0 && typeof currentList[currentList.length - 1] === "object") {
            const lastObj = currentList[currentList.length - 1] as Record<string, unknown>;
            lastObj[k] = this.parseScalar(v);
          } else {
            if (!currentObj) currentObj = {};
            currentObj[k] = this.parseScalar(v);
          }
        }
      }
    }

    if (currentList && currentKey) {
      result[currentKey] = currentList;
    }
    if (currentObj && currentKey) {
      result[currentKey] = currentObj;
    }

    return result as unknown as OKFFrontmatter;
  }

  private static parseScalar(val: string): unknown {
    if ((val.startsWith("[") && !val.endsWith("]")) || (val.startsWith("{") && !val.endsWith("}"))) {
      throw new Error(`Malformed YAML scalar syntax: unclosed collection bracket in '${val}'`);
    }
    if (val.startsWith('"')) {
      if (!val.endsWith('"') || val.length === 1) {
        throw new Error(`Malformed YAML scalar syntax: unclosed double quote in '${val}'`);
      }
      return val.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    }
    if (val.startsWith("'")) {
      if (!val.endsWith("'") || val.length === 1) {
        throw new Error(`Malformed YAML scalar syntax: unclosed single quote in '${val}'`);
      }
      return val.slice(1, -1).replace(/\\'/g, "'").replace(/\\\\/g, "\\");
    }
    if (val === "true") return true;
    if (val === "false") return false;
    if (val === "null") return null;
    if (!isNaN(Number(val)) && val !== "") return Number(val);
    return val;
  }

  private static escapeYamlString(str: string): string {
    if (str.includes(":") || str.includes("#") || str.includes('"') || str.includes("'")) {
      return `"${str.replace(/"/g, '\\"')}"`;
    }
    return str;
  }
}
