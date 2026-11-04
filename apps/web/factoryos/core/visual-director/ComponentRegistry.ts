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

export type RegistryQueryMode = "production" | "test" | "preview";

export interface ComponentQueryFilters {
  category?: ComponentCategory;
  qualificationStatus?: QualificationStatus;
  profile?: RendererProfile;
  mode?: RegistryQueryMode;
}

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

  public isCompatibleWithProfile(
    componentId: string,
    profile: RendererProfile,
    mode: RegistryQueryMode = "production"
  ): boolean {
    const comp = this.get(componentId);
    if (!comp) return false;
    if (mode === "production" && profile === "reference-only") return false;
    return comp.supportedRendererProfiles.includes(profile);
  }

  public list(filters?: ComponentQueryFilters): ComponentDefinition[] {
    let result = Array.from(this.components.values());
    const mode = filters?.mode ?? "production";

    if (filters?.category) {
      result = result.filter(c => c.category === filters.category);
    }

    if (filters?.profile) {
      if (mode === "production" && filters.profile === "reference-only") {
        throw new Error(
          `[ComponentRegistry] 'reference-only' components cannot be queried for executable production pipelines.`
        );
      }
      result = result.filter(c => c.supportedRendererProfiles.includes(filters.profile!));
    }

    if (filters?.qualificationStatus) {
      result = result.filter(c => c.qualificationStatus === filters.qualificationStatus);
    } else {
      // Automatic qualification gate based on execution mode
      if (mode === "production") {
        // In production, strictly reject CANDIDATE, CONTRACT_TESTED, DEPRECATED, and REJECTED
        result = result.filter(c => c.qualificationStatus === "QUALIFIED");
      } else {
        // In test or preview mode, admit QUALIFIED, CONTRACT_TESTED, and CANDIDATE
        result = result.filter(c => c.qualificationStatus !== "DEPRECATED" && c.qualificationStatus !== "REJECTED");
      }
    }

    return result;
  }

  /**
   * findBestMatch — Finds the best qualified component for a category, profile, and canvas format.
   * 
   * Strict Guarantees:
   * 1. Dimensions (width, height, and FPS) must all strictly match the target.
   * 2. In 'production' mode (default), ONLY components with qualificationStatus === 'QUALIFIED' are returned.
   * 3. CANDIDATE and CONTRACT_TESTED components are returned ONLY when mode === 'preview' or 'test'.
   * 4. Throws if profile is 'reference-only' in production mode (reference-only components are never executable).
   * 5. Returns undefined if no compatible, qualified component is registered.
   */
  public findBestMatch(
    category: ComponentCategory,
    targetWidth = 1080,
    targetHeight = 1920,
    targetFps = 30,
    profile: RendererProfile = "shorts-native",
    mode: RegistryQueryMode = "production"
  ): ComponentDefinition | undefined {
    if (mode === "production" && profile === "reference-only") {
      throw new Error(
        `[ComponentRegistry] Profile 'reference-only' cannot be selected for executable production rendering.`
      );
    }

    const candidates = this.list({ category, profile, mode });
    return candidates.find(c =>
      c.supportedDimensions.some(
        d => d.width === targetWidth && d.height === targetHeight && d.fps === targetFps
      )
    );
  }

  public clear(): void {
    this.components.clear();
  }
}
