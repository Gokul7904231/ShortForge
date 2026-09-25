/**
 * Workflow Loader
 *
 * Reads and caches content generation workflow manifests from the
 * content-engines directory. Replaces the older EngineLoader.
 */

import {
  getCompatibilityEngineConfiguration,
  getCompatibilityEngineContracts,
  type EngineConfigurationSchema,
  type EngineContractProfile,
} from "../../lib/core/EngineConfigurationContracts";

export interface WorkflowStep {
  id: string;
  enabled: boolean;
  dependsOn?: string[];
  retry?: number;
  timeout?: number;
  approvalRequired?: boolean;
  config?: Record<string, any>;
}

export interface WorkflowManifest {
  name: string;
  id: string;
  version: string;
  renderProfile: string;
  workflowVersion?: string;
  steps?: WorkflowStep[];
  // Slugs
  hookPromptSlug?: string;
  scenePromptSlug?: string;
  voicePromptSlug?: string;
  thumbnailPromptSlug?: string;
  metadataPromptSlug?: string;
  // Old legacy paths (supported as fallbacks)
  hookPrompt?: string;
  scenePrompt?: string;
  voicePrompt?: string;
  thumbnailPrompt?: string;
  metadataPrompt?: string;
  criticRules?: string | any;
  rendererConfig?: string;

  /** Declarative creator-facing configuration contract. */
  configuration?: EngineConfigurationSchema;

  /** Engine-specific research, creative, media, render, and verification contracts. */
  contracts?: EngineContractProfile;
}

export interface JobDefinition {
  engine: string; // mapped to workflow
  topic: string;
  voice?: "male" | "female" | "neutral";
  provider?: string;
  profile?: string;
  publish?: boolean;
  dryRun?: boolean;
  videoPath?: string;
  platforms?: string[];
  overrides?: Partial<WorkflowManifest>;
  options?: Record<string, any>;
}

class WorkflowLoaderClass {
  private cache = new Map<string, WorkflowManifest>();

  getAllWorkflows(): WorkflowManifest[] {
    return Array.from(this.cache.values());
  }

  getWorkflow(id: string): WorkflowManifest | undefined {
    return this.cache.get(id);
  }

  // Keep backward compatible alias
  getEngine(id: string): WorkflowManifest | undefined {
    return this.getWorkflow(id);
  }

  register(manifest: WorkflowManifest): void {
    const normalized: WorkflowManifest = {
      ...manifest,
      configuration:
        manifest.configuration ?? getCompatibilityEngineConfiguration(manifest.id),
      contracts:
        manifest.contracts ?? getCompatibilityEngineContracts(manifest.id),
    };

    console.log(
      `[WorkflowLoader] Registered workflow: "${normalized.name}" (${normalized.id} v${normalized.version})`
    );
    this.cache.set(normalized.id, normalized);
  }
}

export const WorkflowLoader = new WorkflowLoaderClass();
// Backward compatibility exports
export const EngineLoader = WorkflowLoader;
export type EngineManifest = WorkflowManifest;
export type CriticRules = any;
export type JobResult = any;
