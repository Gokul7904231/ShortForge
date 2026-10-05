export type RendererExecutionMode =
  | "EDITOR"
  | "WASM_PREVIEW"
  | "HEADLESS"
  | "MCP"
  | "DISTRIBUTED";

export interface RendererCapabilitySet {
  /** Modeled representational capability; runtime proof is expressed separately by executionModes. */
  readonly timeline: boolean;
  readonly keyframes: boolean;
  readonly effects: boolean;
  readonly masks: boolean;
  readonly captions: boolean;
  readonly audioWaveform: boolean;
  readonly rippleEditing: boolean;
  readonly wasmPreview: boolean;
  readonly editorApi: boolean;
  readonly pluginRuntime: boolean;
  readonly mcpServer: boolean;
  readonly headlessExecution: boolean;
  readonly scripting: boolean;
}

export interface RendererCapabilityContract {
  readonly rendererId: string;
  readonly version: string;
  readonly status: "CANONICAL" | "EXPERIMENTAL" | "UNVERIFIED" | "RETIRED";
  /** Runtime modes physically proven for this renderer contract. */
  readonly executionModes: readonly RendererExecutionMode[];
  /** Future integration surfaces that are not yet runtime-proven. */
  readonly integrationTargets?: readonly RendererExecutionMode[];
  readonly capabilities: RendererCapabilitySet;
  readonly authorityBoundary: "SHORTFORGE_ONLY";
  readonly requiresOkfAdmission: boolean;
}

export interface RendererAdmission {
  readonly rendererId: string;
  readonly admissionClass: "PRODUCTION" | "EXPERIMENTAL" | "UNVERIFIED";
  readonly productionEligible: boolean;
  readonly authority: "SHORTFORGE_OKF";
  readonly notes?: string;
}

export const NATIVE_RENDERER_CAPABILITY: RendererCapabilityContract = {
  rendererId: "factoryos-native",
  version: "current",
  status: "CANONICAL",
  executionModes: ["HEADLESS", "DISTRIBUTED"],
  capabilities: {
    timeline: true,
    keyframes: true,
    effects: true,
    masks: false,
    captions: true,
    audioWaveform: true,
    rippleEditing: true,
    wasmPreview: false,
    editorApi: false,
    pluginRuntime: false,
    mcpServer: false,
    headlessExecution: true,
    scripting: false,
  },
  authorityBoundary: "SHORTFORGE_ONLY",
  requiresOkfAdmission: true,
};

export function isCapabilitySupported(
  contract: RendererCapabilityContract,
  capability: keyof RendererCapabilitySet,
): boolean {
  return contract.capabilities[capability];
}


export function validateRendererCapabilityContract(
  contract: RendererCapabilityContract,
): string[] {
  const errors: string[] = [];
  const requirements: Array<[RendererExecutionMode, boolean]> = [
    ["EDITOR", contract.capabilities.editorApi],
    ["WASM_PREVIEW", contract.capabilities.wasmPreview],
    ["HEADLESS", contract.capabilities.headlessExecution],
    ["MCP", contract.capabilities.mcpServer],
  ];

  for (const [mode, supported] of requirements) {
    if (contract.executionModes.includes(mode) && !supported) {
      errors.push(`Renderer ${contract.rendererId} advertises ${mode} without matching runtime capability proof.`);
    }
  }

  for (const mode of contract.executionModes) {
    if (contract.integrationTargets?.includes(mode)) {
      errors.push(`Renderer ${contract.rendererId} lists ${mode} as both proven and roadmap-only.`);
    }
  }

  if (contract.authorityBoundary !== "SHORTFORGE_ONLY") {
    errors.push(`Renderer ${contract.rendererId} must remain under ShortForge authority.`);
  }

  return errors;
}
