/**
 * Immutable mission-level production configuration.
 *
 * ProductionSpec is compiled from an engine manifest plus creator intent.
 * It does not replace floor contracts or sovereign governance.
 */

import type {
  EngineConfigurationSchema,
  EngineContractProfile,
} from "../../../lib/core/EngineConfigurationContracts";

export interface ProductionSpecConfiguration {
  content: Record<string, any>;
  creative: Record<string, any>;
  media: Record<string, any>;
  delivery: Record<string, any>;
  runtime: Record<string, any>;
  lifecycle: Record<string, any>;
  extensions: Record<string, any>;
}

export interface ProductionSpec {
  specId: string;
  schemaVersion: string;
  status: "COMPILED";
  immutable: true;
  engine: {
    engineId: string;
    manifestVersion: string;
    configVersion: number;
    configurationSchema: EngineConfigurationSchema;
    contracts: EngineContractProfile;
  };
  configuration: ProductionSpecConfiguration;
  compilation: {
    compiler: "FactoryOS.ProductionSpecCompiler";
    compiledAt: string;
    hash: string;
    source: "creator-config" | "compatibility-config";
  };
  provenance: {
    sourceEngine: string;
    sourceManifestVersion: string;
    sourceConfigVersion: number;
  };
}
