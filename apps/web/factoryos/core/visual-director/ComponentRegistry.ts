/**
 * ComponentRegistry — Canonical Catalogue for Visual Components
 * 
 * Enforces strict provenance, commercial licensing, dimension support (1080x1920 30fps),
 * and renderer-profile compatibility ("shorts-native", "remotion", "reference-only").
 * Prevents unsupported Remotion components from leaking into native Shorts pipelines,
 * while preserving Remotion component definitions for general/horizontal video surfaces.
 */

export type ComponentCategory =
  | "container"
  | "badge"
  | "progress"
  | "reveal"
  | "cta"
  | "transition"
  | "icon";

export type ComponentType =
  | "native_pillow"
  | "vector_svg"
  | "raster_overlay"
  | "motion_recipe"
  | "remotion_composition";

export type RendererProfile =
  | "shorts-native"
  | "remotion"
  | "reference-only";

export type QualificationStatus =
  | "CANDIDATE"
  | "CONTRACT_TESTED"
  | "QUALIFIED"
  | "DEPRECATED"
  | "REJECTED";

export interface ComponentDimension {
  width: number;
  height: number;
  fps: number;
}

export interface ComponentDefinition {
  id: string;
  name: string;
  category: ComponentCategory;
  version: string;
  contentHash: string;
  type: ComponentType;
  supportedDimensions: ComponentDimension[];
  inputSchema: Record<string, any>;
  timingBehavior: {
    allowsTransition: boolean;
    defaultDurationFrames?: number;
  };
  supportedRendererProfiles: RendererProfile[];
  license: {
    spdxId: string;
    author: string;
    isCommercialAllowed: boolean;
    attributionText?: string;
  };
  qualificationStatus: QualificationStatus;
}

export class ComponentRegistry {
  private static instance: ComponentRegistry;
  private components: Map<string, ComponentDefinition> = new Map();

  private constructor() {}

  public static getInstance(): ComponentRegistry {
    if (!ComponentRegistry.instance) {
      ComponentRegistry.instance = new ComponentRegistry();
    }
    return ComponentRegistry.instance;
  }

  public register(def: ComponentDefinition): void {
    // 1. Validate required fields
    if (!def.id || !def.name || !def.category || !def.version || !def.contentHash) {
      throw new Error(`[ComponentRegistry] Invalid component definition: missing required core metadata.`);
    }

    if (!def.supportedDimensions || def.supportedDimensions.length === 0) {
      throw new Error(`[ComponentRegistry] Component ${def.id} must specify at least one supported dimension.`);
    }

    if (!def.supportedRendererProfiles || def.supportedRendererProfiles.length === 0) {
      throw new Error(`[ComponentRegistry] Component ${def.id} must declare at least one supported renderer profile.`);
    }

    if (!def.license || typeof def.license.isCommercialAllowed !== "boolean") {
      throw new Error(`[ComponentRegistry] Component ${def.id} missing explicit commercial licensing declaration.`);
    }

    // 2. Duplicate ID detection
    if (this.components.has(def.id)) {
      throw new Error(`[ComponentRegistry] Duplicate registration: component '${def.id}' is already registered.`);
    }

    // 3. Licensing gate: Fail closed if commercial use is disallowed
    if (!def.license.isCommercialAllowed) {
      throw new Error(`[ComponentRegistry] Component '${def.id}' rejected: Commercial use is disallowed under ${def.license.spdxId}.`);
    }

    this.components.set(def.id, def);
  }

  public get(id: string): ComponentDefinition | undefined {
    return this.components.get(id);
  }

  public isCompatibleWithProfile(componentId: string, profile: RendererProfile): boolean {
    const comp = this.get(componentId);
    if (!comp) return false;
    return comp.supportedRendererProfiles.includes(profile);
  }

  public list(filters?: {
    category?: ComponentCategory;
    qualificationStatus?: QualificationStatus;
    profile?: RendererProfile;
  }): ComponentDefinition[] {
    let result = Array.from(this.components.values());
    if (filters?.category) {
      result = result.filter(c => c.category === filters.category);
    }
    if (filters?.qualificationStatus) {
      result = result.filter(c => c.qualificationStatus === filters.qualificationStatus);
    }
    if (filters?.profile) {
      result = result.filter(c => c.supportedRendererProfiles.includes(filters.profile!));
    }
    return result;
  }

  public findBestMatch(
    category: ComponentCategory,
    targetWidth = 1080,
    targetHeight = 1920,
    profile: RendererProfile = "shorts-native"
  ): ComponentDefinition | undefined {
    const candidates = this.list({ category, profile });
    return candidates.find(c =>
      c.supportedDimensions.some(d => d.width === targetWidth && d.height === targetHeight)
    );
  }

  public clear(): void {
    this.components.clear();
  }
}
