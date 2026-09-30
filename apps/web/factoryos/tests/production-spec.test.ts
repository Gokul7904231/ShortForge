import { describe, expect, it } from "vitest";

import {
  getCompatibilityEngineConfiguration,
  validateEngineConfigurationSchema,
} from "../../lib/core/EngineConfigurationContracts";
import { compileProductionSpec } from "../core/engines/ProductionSpecCompiler";
import type { EngineDefinition } from "../../lib/core/EngineContracts";

function buildEngine(): EngineDefinition {
  return {
    engineId: "quiz",
    name: "Quiz Engine",
    description: "Test engine",
    status: "ACTIVE",
    visibility: "SYSTEM",
    category: "QUIZ",
    generationConfig: {
      renderProfile: "FAST_QUIZ",
      workflow: "quiz",
    },
    defaults: {
      difficulty: "medium",
      tone: "Challenging",
      voice: "neutral",
      ratio: "9:16",
      retentionPolicy: "72 hours",
    },
    capabilities: {
      supportsDraftReview: true,
      supportsQuestionEditing: true,
      supportsMultipleTopics: true,
      supportsGeoMode: true,
    },
    validation: { schemaVersion: "1.0" },
    configuration: getCompatibilityEngineConfiguration("quiz"),
    contracts: {},
    manifestVersion: "1.0",
    configVersion: 1,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

describe("ProductionSpec", () => {
  it("validates the compatibility quiz configuration schema", () => {
    const result = validateEngineConfigurationSchema(
      getCompatibilityEngineConfiguration("quiz")
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("compiles creator intent into bounded sections and hashes it", () => {
    const result = compileProductionSpec({
      jobId: "job_test_001",
      engine: buildEngine(),
      userConfig: {
        topic: "Global Geography Quiz",
        difficulty: "hard",
        audience: "general",
        tone: "Dramatic",
        voice: "female",
        ratio: "9:16",
        durationSeconds: 50,
        platforms: ["youtube", "tiktok"],
        providerOverride: "auto",
        retentionHours: 72,
      },
    });

    expect(result.spec.configuration.content.topic).toBe("Global Geography Quiz");
    expect(result.spec.configuration.content.difficulty).toBe("hard");
    expect(result.spec.configuration.creative.tone).toBe("Dramatic");
    expect(result.spec.configuration.media.durationSeconds).toBe(50);
    expect(result.spec.configuration.delivery.platforms).toEqual([
      "youtube",
      "tiktok",
    ]);
    expect(result.spec.compilation.hash).toHaveLength(64);
    expect(result.spec.immutable).toBe(true);
  });

  it("rejects unsupported enum values", () => {
    expect(() =>
      compileProductionSpec({
        jobId: "job_test_002",
        engine: buildEngine(),
        userConfig: {
          topic: "Global Geography Quiz",
          difficulty: "impossible",
        },
      })
    ).toThrow(/unsupported option/i);
  });

  it("rejects unknown configuration keys", () => {
    expect(() =>
      compileProductionSpec({
        jobId: "job_test_003",
        engine: buildEngine(),
        userConfig: {
          topic: "Global Geography Quiz",
          unsafeRuntimeMutation: true,
        },
      })
    ).toThrow(/unknown engine configuration field/i);
  });
});
