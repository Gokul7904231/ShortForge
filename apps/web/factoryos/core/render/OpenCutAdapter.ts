import {
  canonicalizeComposition,
  validateCompositionIR,
  type CompositionIR,
} from "../timeline/CompositionIR";
import type {
  RendererCapabilityContract,
  RendererAdmission,
} from "./RendererCapabilityContracts";

export interface OpenCutCompatibilityDocument {
  readonly format: "SHORTFORGE_OPENCUT_BRIDGE";
  readonly version: "1.0.0";
  readonly sourceOfTruth: "SHORTFORGE_COMPOSITION_IR";
  readonly composition: CompositionIR;
  readonly mapping: {
    readonly timeline: "DIRECT";
    readonly keyframes: "DIRECT";
    readonly effects: "DIRECT";
    readonly masks: "DIRECT";
    readonly captions: "DIRECT";
    readonly waveform: "METADATA";
    readonly editorApi: "ROADMAP";
    readonly pluginApi: "ROADMAP";
    readonly mcp: "ROADMAP";
    readonly headless: "ROADMAP";
    readonly scripting: "ROADMAP";
  };
}

export const OPEN_CUT_RENDERER_CAPABILITY: RendererCapabilityContract = {
  rendererId: "opencut",
  version: "bridge-v1",
  status: "EXPERIMENTAL",
  executionModes: ["EDITOR", "WASM_PREVIEW", "HEADLESS", "MCP"],
  capabilities: {
    timeline: true,
    keyframes: true,
    effects: true,
    masks: true,
    captions: true,
    audioWaveform: true,
    rippleEditing: true,
    wasmPreview: true,
    editorApi: false,
    pluginRuntime: false,
    mcpServer: false,
    headlessExecution: false,
    scripting: false,
  },
  authorityBoundary: "SHORTFORGE_ONLY",
  requiresOkfAdmission: true,
};

export const OPEN_CUT_EXPERIMENTAL_ADMISSION: RendererAdmission = {
  rendererId: "opencut",
  admissionClass: "EXPERIMENTAL",
  productionEligible: false,
  authority: "SHORTFORGE_OKF",
  notes:
    "Adapter is intentionally fail-closed until the OpenCut rewrite exposes and proves a stable Editor API, headless execution and/or MCP contract.",
};

export class OpenCutAdapter {
  public static capability(): RendererCapabilityContract {
    return OPEN_CUT_RENDERER_CAPABILITY;
  }

  public static admission(): RendererAdmission {
    return OPEN_CUT_EXPERIMENTAL_ADMISSION;
  }

  public static validate(composition: CompositionIR): { valid: boolean; errors: string[] } {
    const report = validateCompositionIR(composition);
    return {
      valid: report.valid,
      errors: [...report.errors],
    };
  }

  public static toDocument(composition: CompositionIR): OpenCutCompatibilityDocument {
    const validation = validateCompositionIR(composition);
    if (!validation.valid) {
      throw new Error(
        `OpenCut adapter rejected invalid CompositionIR: ${validation.errors.join("; ")}`,
      );
    }

    return {
      format: "SHORTFORGE_OPENCUT_BRIDGE",
      version: "1.0.0",
      sourceOfTruth: "SHORTFORGE_COMPOSITION_IR",
      composition,
      mapping: {
        timeline: "DIRECT",
        keyframes: "DIRECT",
        effects: "DIRECT",
        masks: "DIRECT",
        captions: "DIRECT",
        waveform: "METADATA",
        editorApi: "ROADMAP",
        pluginApi: "ROADMAP",
        mcp: "ROADMAP",
        headless: "ROADMAP",
        scripting: "ROADMAP",
      },
    };
  }

  public static serialize(composition: CompositionIR): string {
    return canonicalizeComposition(OpenCutAdapter.toDocument(composition));
  }
}
