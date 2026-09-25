/**
 * EngineRegistry Facade — FactoryOS Canonical Engine Registry
 * 
 * Unifies access across system engines (WorkflowLoader) and custom dynamic engines (EngineDiscovery).
 * Enforces fail-closed lifecycle status checks and user/tier visibility.
 */

import { WorkflowLoader, type WorkflowManifest } from "../../content-engines/_loader";
import { EngineDiscovery } from "./EngineDiscovery";
import {
  EngineDefinition,
  EngineStatus,
  EngineVisibility,
  EngineCategory,
} from "./EngineContracts";
import {
  getCompatibilityEngineConfiguration,
  getCompatibilityEngineContracts,
  getConfigurationDefaults,
  validateEngineConfigurationSchema,
} from "./EngineConfigurationContracts";

// System Engine Catalog Metadata mapping
const SYSTEM_ENGINES_METADATA: Record<
  string,
  {
    name: string;
    description: string;
    category: EngineCategory;
    isDefault?: boolean;
    capabilities: {
      supportsDraftReview: boolean;
      supportsQuestionEditing?: boolean;
      supportsMultipleTopics?: boolean;
      supportsGeoMode?: boolean;
    };
  }
> = {
  quiz: {
    name: "Quiz Engine",
    description: "Viral trivia challenges, Geo Quizzes, and multi-topic knowledge tests.",
    category: "QUIZ",
    isDefault: true,
    capabilities: {
      supportsDraftReview: true,
      supportsQuestionEditing: true,
      supportsMultipleTopics: true,
      supportsGeoMode: true,
    },
  },
  facts: {
    name: "Facts Engine",
    description: "Curiosity-driven fast educational shorts and shocking facts.",
    category: "EDUCATION",
    isDefault: true,
    capabilities: {
      supportsDraftReview: true,
      supportsQuestionEditing: false,
      supportsMultipleTopics: false,
      supportsGeoMode: false,
    },
  },
  history: {
    name: "History Engine",
    description: "Cinematic narratives of pivotal historical events and figures.",
    category: "STORY",
    isDefault: true,
    capabilities: {
      supportsDraftReview: true,
      supportsQuestionEditing: false,
      supportsMultipleTopics: false,
      supportsGeoMode: false,
    },
  },
  motivation: {
    name: "Motivation Engine",
    description: "High-energy inspiring speeches, quotes, and mindsets.",
    category: "MOTIVATION",
    isDefault: true,
    capabilities: {
      supportsDraftReview: true,
      supportsQuestionEditing: false,
      supportsMultipleTopics: false,
      supportsGeoMode: false,
    },
  },
  story: {
    name: "Story Engine",
    description: "Engaging narrative storytelling with suspenseful retention hooks.",
    category: "STORY",
    capabilities: {
      supportsDraftReview: true,
      supportsQuestionEditing: false,
      supportsMultipleTopics: false,
      supportsGeoMode: false,
    },
  },
  reddit: {
    name: "Reddit Engine",
    description: "Community anecdotes, top stories, and social commentary shorts.",
    category: "OTHER",
    capabilities: {
      supportsDraftReview: true,
      supportsQuestionEditing: false,
      supportsMultipleTopics: false,
      supportsGeoMode: false,
    },
  },
  coding: {
    name: "Coding Engine",
    description: "Developer tips, programming trivia, and software engineering insights.",
    category: "EDUCATION",
    capabilities: {
      supportsDraftReview: true,
      supportsQuestionEditing: true,
      supportsMultipleTopics: false,
      supportsGeoMode: false,
    },
  },
  psychology: {
    name: "Psychology Engine",
    description: "Cognitive biases, mind tricks, and behavioral psychology breakdowns.",
    category: "EXPLAINER",
    capabilities: {
      supportsDraftReview: true,
      supportsQuestionEditing: false,
      supportsMultipleTopics: false,
      supportsGeoMode: false,
    },
  },
};

export interface UserContext {
  uid?: string;
  role?: string; // "USER" | "EDITOR" | "ADMIN" | "OWNER" | "PRO"
}

class EngineRegistryClass {
  private initialized = false;

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await EngineDiscovery.discoverAll();
      this.initialized = true;
    }
  }

  /**
   * Translates a system WorkflowManifest into an EngineDefinition.
   */
  private mapSystemManifest(id: string, manifest: WorkflowManifest): EngineDefinition {
    const configuration =
      manifest.configuration ?? getCompatibilityEngineConfiguration(id);
    const contracts =
      manifest.contracts ?? getCompatibilityEngineContracts(id);
    const configDefaults = getConfigurationDefaults(configuration);

    const meta = SYSTEM_ENGINES_METADATA[id] || {
      name: manifest.name || id,
      description: `Production execution engine for ${manifest.name || id}`,
      category: "OTHER" as EngineCategory,
      isDefault: false,
      capabilities: {
        supportsDraftReview: true,
      },
    };

    return {
      engineId: id,
      name: meta.name,
      description: meta.description,
      status: "ACTIVE",
      visibility: "SYSTEM",
      category: meta.category,
      isDefault: meta.isDefault ?? false,
      generationConfig: {
        renderProfile: manifest.renderProfile || "FAST_QUIZ",
        workflow: manifest.id,
      },
      defaults: {
        difficulty: configDefaults.difficulty,
        tone: configDefaults.tone,
        audience: configDefaults.audience,
        voice: configDefaults.voice,
        ratio: configDefaults.ratio,
        thumbnailStyle: configDefaults.thumbnailStyle,
        retentionPolicy:
          configDefaults.retentionHours === 0
            ? "never"
            : configDefaults.retentionHours !== undefined
              ? String(configDefaults.retentionHours) + " hours"
              : undefined,
      },
      capabilities: meta.capabilities,
      validation: {
        schemaVersion: configuration.schemaVersion,
        validatedAt: new Date().toISOString(),
      },
      configuration,
      contracts,
      manifestVersion: manifest.version || "1.0",
      configVersion: 1,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Translates a custom engine object into an EngineDefinition.
   */
  private mapCustomEngine(eng: any): EngineDefinition {
    return {
      engineId: eng.id,
      name: eng.name || eng.id,
      description: eng.description || `Custom user engine ${eng.name || eng.id}`,
      status: (eng.status as EngineStatus) || "ACTIVE",
      visibility: (eng.visibility as EngineVisibility) || "USER",
      ownerId: eng.ownerId,
      category: (eng.category as EngineCategory) || "OTHER",
      isDefault: false,
      generationConfig: {
        renderProfile: eng.renderProfile || "FAST_QUIZ",
        workflow: eng.workflow || "custom-workflow",
      },
      defaults: {
        difficulty:
          eng.difficulty ??
          eng.configuration?.fields?.find((f: any) => f.key === "difficulty")?.defaultValue ??
          "medium",
        tone:
          eng.tone ??
          eng.configuration?.fields?.find((f: any) => f.key === "tone")?.defaultValue ??
          "General",
        audience:
          eng.audience ??
          eng.configuration?.fields?.find((f: any) => f.key === "audience")?.defaultValue,
        voice:
          eng.voice ??
          eng.configuration?.fields?.find((f: any) => f.key === "voice")?.defaultValue ??
          "alloy",
        ratio:
          eng.ratio ??
          eng.configuration?.fields?.find((f: any) => f.key === "ratio")?.defaultValue ??
          "9:16",
        thumbnailStyle:
          eng.thumbnailStyle ??
          eng.configuration?.fields?.find((f: any) => f.key === "thumbnailStyle")?.defaultValue,
        retentionPolicy:
          eng.retention ??
          String(
            eng.configuration?.fields?.find((f: any) => f.key === "retentionHours")?.defaultValue ?? 72
          ) + " hours",
      },
      capabilities: eng.capabilities || {
        supportsDraftReview: true,
        supportsQuestionEditing: eng.category === "QUIZ",
        supportsMultipleTopics: eng.category === "QUIZ",
        supportsGeoMode: eng.category === "QUIZ",
      },
      validation: eng.validation || {
        schemaVersion: eng.configuration?.schemaVersion || "1.0",
        validatedAt: new Date().toISOString(),
      },
      configuration:
        eng.configuration ?? getCompatibilityEngineConfiguration(eng.id),
      contracts:
        eng.contracts ?? getCompatibilityEngineContracts(eng.id),
      manifestVersion: eng.version || "1.0",
      configVersion: eng.configVersion || 1,
      createdAt: eng.createdAt || new Date().toISOString(),
      updatedAt: eng.updatedAt || new Date().toISOString(),
    };
  }

  /**
   * Retrieves all registered engines.
   */
  async getAllEngines(): Promise<EngineDefinition[]> {
    await this.ensureInitialized();
    const result: EngineDefinition[] = [];

    // 1. Load system engines from WorkflowLoader
    const discoveredIds = EngineDiscovery.getDiscovered();
    for (const id of discoveredIds) {
      const manifest = WorkflowLoader.getEngine(id);
      if (manifest) {
        result.push(this.mapSystemManifest(id, manifest));
      }
    }

    return result;
  }

  /**
   * Lists selectable ACTIVE engines according to the user's role and ownership.
   */
  async listAvailableEngines(userContext?: UserContext): Promise<EngineDefinition[]> {
    const all = await this.getAllEngines();
    const role = (userContext?.role || "USER").toUpperCase();
    const isProOrAdmin = role === "PRO" || role === "ADMIN" || role === "OWNER";
    const userId = userContext?.uid;

    return all.filter((eng) => {
      // Must be strictly ACTIVE
      if (eng.status !== "ACTIVE") return false;

      // System engines are available to all authenticated users
      if (eng.visibility === "SYSTEM") return true;

      // User engines are visible to Pro/Admin if owned by the user or global
      if (eng.visibility === "USER") {
        if (!isProOrAdmin) return false;
        if (!eng.ownerId || eng.ownerId === userId || role === "ADMIN" || role === "OWNER") {
          return true;
        }
      }

      return false;
    });
  }

  /**
   * Gets a specific engine by its canonical engineId.
   */
  async getEngine(engineId: string): Promise<EngineDefinition | undefined> {
    await this.ensureInitialized();
    const manifest = WorkflowLoader.getEngine(engineId);
    if (manifest) {
      return this.mapSystemManifest(engineId, manifest);
    }
    return undefined;
  }

  /**
   * Validates an engine definition deterministically.
   */
  validateEngine(definition: Partial<EngineDefinition>): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!definition.name || definition.name.trim().length === 0) {
      errors.push("Engine name is required.");
    }

    if (!definition.generationConfig?.renderProfile) {
      errors.push("Generation render profile is required.");
    }

    const validProfiles = ["FAST_QUIZ", "FAST_SHORTS", "AUTO", "CINEMATIC", "HIGH_RES"];
    if (
      definition.generationConfig?.renderProfile &&
      !validProfiles.includes(definition.generationConfig.renderProfile)
    ) {
      errors.push(`Unsupported render profile: ${definition.generationConfig.renderProfile}`);
    }

    if (definition.configuration) {
      errors.push(...validateEngineConfigurationSchema(definition.configuration).errors);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Creates a new user engine through EngineDiscovery.
   */
  async createEngine(
    definition: Partial<EngineDefinition> & { prompt?: string; sceneRules?: string },
    userContext?: UserContext
  ): Promise<EngineDefinition> {
    const validation = this.validateEngine(definition);
    if (!validation.valid) {
      throw new Error(`Engine validation failed: ${validation.errors.join("; ")}`);
    }

    const name = String(definition.name).trim();
    const engineId = definition.engineId || name.toLowerCase().replace(/\s+/g, "-");

    const newEngineData = {
      id: engineId,
      name,
      description: definition.description || "",
      version: "1.0",
      renderProfile: definition.generationConfig?.renderProfile || "FAST_QUIZ",
      prompt: definition.prompt,
      sceneRules: definition.sceneRules,
      category: definition.category || "OTHER",
      ownerId: userContext?.uid,
      visibility: "USER" as EngineVisibility,
      status: "ACTIVE" as EngineStatus,
      configVersion: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      configuration:
        definition.configuration ?? getCompatibilityEngineConfiguration(engineId),
      contracts:
        definition.contracts ?? getCompatibilityEngineContracts(engineId),
      capabilities: definition.capabilities || {
        supportsDraftReview: true,
        supportsQuestionEditing: definition.category === "QUIZ",
        supportsMultipleTopics: definition.category === "QUIZ",
        supportsGeoMode: definition.category === "QUIZ",
      },
    };

    EngineDiscovery.registerDynamicEngine(newEngineData);
    return this.mapCustomEngine(newEngineData);
  }
}

export const EngineRegistry = new EngineRegistryClass();
