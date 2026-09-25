import crypto from "crypto";

import type { EngineDefinition } from "../../../lib/core/EngineContracts";
import {
  getConfigurationDefaults,
  type EngineConfigField,
} from "../../../lib/core/EngineConfigurationContracts";
import type {
  ProductionSpec,
  ProductionSpecConfiguration,
} from "../contracts/ProductionSpecContracts";

export interface CompileProductionSpecInput {
  jobId: string;
  engine: EngineDefinition;
  userConfig: Record<string, any>;
}

export interface CompileProductionSpecResult {
  spec: ProductionSpec;
  normalizedConfig: Record<string, any>;
}

function stableSort(value: any): any {
  if (Array.isArray(value)) return value.map(stableSort);
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce<Record<string, any>>((acc, key) => {
        acc[key] = stableSort(value[key]);
        return acc;
      }, {});
  }
  return value;
}

function hashObject(value: any): string {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(stableSort(value)))
    .digest("hex");
}

function coerceFieldValue(field: EngineConfigField, value: any): any {
  if (field.type === "number" && typeof value === "string" && value.trim() !== "") {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  if (field.type === "toggle" && typeof value === "string") {
    if (value === "true") return true;
    if (value === "false") return false;
  }
  return value;
}

function validateField(field: EngineConfigField, value: any): string[] {
  const errors: string[] = [];
  const missing =
    value === undefined ||
    value === null ||
    value === "" ||
    (field.type === "multi-select" && !Array.isArray(value));

  if (field.required && missing) {
    errors.push("Required configuration field " + field.key + " is missing.");
    return errors;
  }

  if (missing) return errors;

  if ((field.type === "text" || field.type === "textarea") && typeof value !== "string") {
    errors.push("Field " + field.key + " must be a string.");
  }

  if (field.type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      errors.push("Field " + field.key + " must be a finite number.");
    } else {
      if (field.min !== undefined && value < field.min) {
        errors.push("Field " + field.key + " must be >= " + field.min + ".");
      }
      if (field.max !== undefined && value > field.max) {
        errors.push("Field " + field.key + " must be <= " + field.max + ".");
      }
    }
  }

  if (field.type === "toggle" && typeof value !== "boolean") {
    errors.push("Field " + field.key + " must be boolean.");
  }

  if (field.type === "select" && field.options) {
    const allowed = new Set(field.options.map((option) => option.value));
    if (!allowed.has(value)) {
      errors.push("Field " + field.key + " has unsupported option " + String(value) + ".");
    }
  }

  if (field.type === "multi-select") {
    if (!Array.isArray(value)) {
      errors.push("Field " + field.key + " must be an array.");
    } else if (field.options) {
      const allowed = new Set(field.options.map((option) => option.value));
      for (const item of value) {
        if (!allowed.has(item)) {
          errors.push(
            "Field " + field.key + " contains unsupported option " + String(item) + "."
          );
        }
      }
    }
  }

  return errors;
}

function buildConfiguration(
  schema: EngineDefinition["configuration"],
  normalized: Record<string, any>
): ProductionSpecConfiguration {
  const configuration: ProductionSpecConfiguration = {
    content: {},
    creative: {},
    media: {},
    delivery: {},
    runtime: {},
    lifecycle: {},
    extensions: {},
  };

  for (const field of schema.fields) {
    configuration[field.section][field.key] = normalized[field.key];
  }

  return configuration;
}

export function compileProductionSpec(
  input: CompileProductionSpecInput
): CompileProductionSpecResult {
  const schema = input.engine.configuration;
  const defaults = getConfigurationDefaults(schema);
  const merged = { ...defaults, ...input.userConfig };
  const errors: string[] = [];
  const declaredKeys = new Set(schema.fields.map((field) => field.key));

  for (const [key, value] of Object.entries(merged)) {
    if (!declaredKeys.has(key) && value !== undefined) {
      errors.push("Unknown engine configuration field " + key + ".");
    }
  }

  const normalizedConfig: Record<string, any> = {};

  for (const field of schema.fields) {
    normalizedConfig[field.key] = coerceFieldValue(field, merged[field.key]);
    errors.push(...validateField(field, normalizedConfig[field.key]));
  }

  if (errors.length > 0) {
    throw new Error("ProductionSpec validation failed: " + errors.join(" "));
  }

  const configuration = buildConfiguration(schema, normalizedConfig);

  const draft = {
    specId: "spec_" + input.jobId.replace(/^job_/, ""),
    schemaVersion: schema.schemaVersion,
    status: "COMPILED" as const,
    immutable: true as const,
    engine: {
      engineId: input.engine.engineId,
      manifestVersion: input.engine.manifestVersion,
      configVersion: input.engine.configVersion,
      configurationSchema: schema,
      contracts: input.engine.contracts,
    },
    configuration,
    provenance: {
      sourceEngine: input.engine.engineId,
      sourceManifestVersion: input.engine.manifestVersion,
      sourceConfigVersion: input.engine.configVersion,
    },
  };

  const hash = hashObject(draft);

  const spec: ProductionSpec = {
    ...draft,
    compilation: {
      compiler: "FactoryOS.ProductionSpecCompiler",
      compiledAt: new Date().toISOString(),
      hash,
      source:
        schema.source === "declared" ? "creator-config" : "compatibility-config",
    },
  };

  return { spec, normalizedConfig };
}
