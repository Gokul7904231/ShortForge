/**
 * ShortForge Blender MCP Contracts
 *
 * Semantic contract between Ascalon/CapabilityRegistry and mcp-for-blender.
 * Ascalon chooses semantic intent; runtime discovery resolves the concrete
 * MCP tool available on the connected Blender worker.
 */

export type BlenderSemanticAction =
  | "SCENE_INSPECT"
  | "OBJECT_INSPECT"
  | "VIEWPORT_CAPTURE"
  | "OBJECT_CREATE"
  | "OBJECT_UPDATE"
  | "OBJECT_DELETE"
  | "MATERIAL_UPDATE"
  | "CAMERA_CONFIGURE"
  | "LIGHTING_CONFIGURE"
  | "ANIMATION_CONFIGURE"
  | "GEOMETRY_NODES_CONFIGURE"
  | "SIMULATION_CONFIGURE"
  | "COMPOSITOR_CONFIGURE"
  | "SEQUENCE_CONFIGURE"
  | "ASSET_SEARCH"
  | "ASSET_IMPORT"
  | "ASSET_GENERATE"
  | "SCENE_EXPORT"
  | "RENDER"
  | "PYTHON_EXECUTE";

export type BlenderActionRisk = "READ_ONLY" | "MUTATING" | "HIGH_RISK" | "CRITICAL";

export type BlenderExecutionMode = "DIRECT_MCP" | "STRUCTURED_SCRIPT" | "RAW_PYTHON";

export interface BlenderActionDefinition {
  readonly action: BlenderSemanticAction;
  readonly risk: BlenderActionRisk;
  readonly executionMode: BlenderExecutionMode;
  readonly requiresGuardianGate: boolean;
  readonly preferredTools: readonly string[];
  readonly fallbackTools?: readonly string[];
  readonly description: string;
}

export interface BlenderActionRequest {
  readonly missionId: string;
  readonly jobId: string;
  readonly floorId: string;
  readonly action: BlenderSemanticAction;
  readonly arguments: Record<string, unknown>;
  readonly allowPythonExecution?: boolean;
  readonly userPrompt?: string;
}

export interface BlenderToolDescriptor {
  readonly name: string;
  readonly description?: string;
  readonly inputSchema?: Record<string, unknown>;
}

export interface BlenderCapabilitySnapshot {
  readonly protocolVersion: string;
  readonly serverName: string;
  readonly serverVersion: string;
  readonly tools: readonly BlenderToolDescriptor[];
  readonly discoveredAt: string;
  readonly addonStatus?: unknown;
}

export interface BlenderActionResolution {
  readonly resolved: boolean;
  readonly action: BlenderSemanticAction;
  readonly toolName?: string;
  readonly reasonCode:
    | "RESOLVED"
    | "NO_RUNTIME_TOOL"
    | "PYTHON_DISABLED"
    | "AMBIGUOUS_TOOL"
    | "INVALID_ACTION";
  readonly candidates: readonly string[];
}

export interface BlenderExecutionObservation {
  readonly action: BlenderSemanticAction;
  readonly toolName: string;
  readonly requestDigestSha256: string;
  readonly capabilitySnapshotDigestSha256: string;
  readonly runtimeProtocolVersion: string;
  readonly runtimeServerVersion: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly durationMs: number;
  readonly success: boolean;
  readonly isError?: boolean;
  readonly result: unknown;
  readonly verificationHints: readonly string[];
}

export const BLENDER_ACTIONS: readonly BlenderActionDefinition[] = [
  {
    action: "SCENE_INSPECT",
    risk: "READ_ONLY",
    executionMode: "DIRECT_MCP",
    requiresGuardianGate: false,
    preferredTools: ["get_scene_info"],
    description: "Inspect current Blender scene state and objects.",
  },
  {
    action: "OBJECT_INSPECT",
    risk: "READ_ONLY",
    executionMode: "DIRECT_MCP",
    requiresGuardianGate: false,
    preferredTools: ["get_object_info"],
    description: "Inspect a named Blender object.",
  },
  {
    action: "VIEWPORT_CAPTURE",
    risk: "READ_ONLY",
    executionMode: "DIRECT_MCP",
    requiresGuardianGate: false,
    preferredTools: ["get_viewport_screenshot", "viewport_capture"],
    description: "Capture visual evidence of the current Blender viewport.",
  },
  {
    action: "OBJECT_CREATE",
    risk: "MUTATING",
    executionMode: "STRUCTURED_SCRIPT",
    requiresGuardianGate: true,
    preferredTools: ["execute_blender_code"],
    description: "Create Blender objects using a controlled script transaction.",
  },
  {
    action: "OBJECT_UPDATE",
    risk: "MUTATING",
    executionMode: "STRUCTURED_SCRIPT",
    requiresGuardianGate: true,
    preferredTools: ["execute_blender_code"],
    description: "Modify object transforms, modifiers, collections or properties.",
  },
  {
    action: "OBJECT_DELETE",
    risk: "HIGH_RISK",
    executionMode: "STRUCTURED_SCRIPT",
    requiresGuardianGate: true,
    preferredTools: ["execute_blender_code"],
    description: "Delete Blender objects or scene data.",
  },
  {
    action: "MATERIAL_UPDATE",
    risk: "MUTATING",
    executionMode: "STRUCTURED_SCRIPT",
    requiresGuardianGate: true,
    preferredTools: ["execute_blender_code"],
    description: "Create or modify materials and shader node graphs.",
  },
  {
    action: "CAMERA_CONFIGURE",
    risk: "MUTATING",
    executionMode: "STRUCTURED_SCRIPT",
    requiresGuardianGate: true,
    preferredTools: ["execute_blender_code"],
    description: "Configure cameras, framing and camera motion.",
  },
  {
    action: "LIGHTING_CONFIGURE",
    risk: "MUTATING",
    executionMode: "STRUCTURED_SCRIPT",
    requiresGuardianGate: true,
    preferredTools: ["execute_blender_code"],
    description: "Configure lights and lighting rigs.",
  },
  {
    action: "ANIMATION_CONFIGURE",
    risk: "MUTATING",
    executionMode: "STRUCTURED_SCRIPT",
    requiresGuardianGate: true,
    preferredTools: ["execute_blender_code"],
    description: "Create or modify keyframes, actions and animation state.",
  },
  {
    action: "GEOMETRY_NODES_CONFIGURE",
    risk: "HIGH_RISK",
    executionMode: "RAW_PYTHON",
    requiresGuardianGate: true,
    preferredTools: ["execute_blender_code"],
    fallbackTools: ["describe_node_type"],
    description: "Inspect and build Geometry Nodes networks.",
  },
  {
    action: "SIMULATION_CONFIGURE",
    risk: "HIGH_RISK",
    executionMode: "RAW_PYTHON",
    requiresGuardianGate: true,
    preferredTools: ["execute_blender_code"],
    description: "Configure physics or simulation data.",
  },
  {
    action: "COMPOSITOR_CONFIGURE",
    risk: "MUTATING",
    executionMode: "RAW_PYTHON",
    requiresGuardianGate: true,
    preferredTools: ["execute_blender_code"],
    description: "Configure compositor node trees and post-processing.",
  },
  {
    action: "SEQUENCE_CONFIGURE",
    risk: "MUTATING",
    executionMode: "RAW_PYTHON",
    requiresGuardianGate: true,
    preferredTools: ["execute_blender_code"],
    description: "Configure Blender's Video Sequence Editor.",
  },
  {
    action: "ASSET_SEARCH",
    risk: "READ_ONLY",
    executionMode: "DIRECT_MCP",
    requiresGuardianGate: false,
    preferredTools: [
      "search_polyhaven_assets",
      "search_sketchfab_models",
      "search_polypizza_models",
    ],
    description: "Search approved external asset providers exposed by the MCP server.",
  },
  {
    action: "ASSET_IMPORT",
    risk: "MUTATING",
    executionMode: "DIRECT_MCP",
    requiresGuardianGate: true,
    preferredTools: [
      "download_polyhaven_asset",
      "download_sketchfab_model",
      "download_polypizza_model",
      "import_generated_asset",
      "import_generated_asset_hunyuan",
      "import_generated_asset_tripo",
    ],
    description: "Import an asset into the Blender scene.",
  },
  {
    action: "ASSET_GENERATE",
    risk: "HIGH_RISK",
    executionMode: "DIRECT_MCP",
    requiresGuardianGate: true,
    preferredTools: [
      "generate_hyper3d_model_via_text",
      "generate_hyper3d_model_via_images",
      "generate_hunyuan3d_model",
      "generate_tripo_model",
    ],
    description: "Request external AI 3D asset generation.",
  },
  {
    action: "SCENE_EXPORT",
    risk: "MUTATING",
    executionMode: "DIRECT_MCP",
    requiresGuardianGate: true,
    preferredTools: ["export_scene"],
    description: "Export scene data for downstream systems.",
  },
  {
    action: "RENDER",
    risk: "HIGH_RISK",
    executionMode: "STRUCTURED_SCRIPT",
    requiresGuardianGate: true,
    preferredTools: ["execute_blender_code"],
    description: "Render a physical image/video artifact from Blender.",
  },
  {
    action: "PYTHON_EXECUTE",
    risk: "CRITICAL",
    executionMode: "RAW_PYTHON",
    requiresGuardianGate: true,
    preferredTools: ["execute_blender_code"],
    description: "Run arbitrary Blender Python. Explicitly disabled unless the caller grants the dangerous capability.",
  },
];
