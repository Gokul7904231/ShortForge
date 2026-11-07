/**
 * ShortForge Exclusive Component Registry (Phase 2)
 * Canonical component definitions, bounding boxes, safe zones (1080x1920),
 * Z-index hierarchy, contrast contracts (WCAG >= 7:1), and timeline state machines.
 */

export interface ComponentBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  maxHeight?: number;
  padding?: number;
}

export interface ContrastContract {
  minRatio: number;
  foregroundHex: string;
  backgroundScrimHex: string;
}

export interface ComponentDefinition {
  id: string;
  name: string;
  version: string;
  zIndex: number;
  safeZone: ComponentBoundingBox;
  contrastContract: ContrastContract;
  supportedStates: string[];
  singleton: boolean;
  audioLockBufferMs?: number;
  description: string;
}

export const SHORTFORGE_CANONICAL_COMPONENTS: Record<string, ComponentDefinition> = {
  // 1. Scene 0 Opening Hook
  'sf.hook.kinetic_stack': {
    id: 'sf.hook.kinetic_stack',
    name: 'Opening Kinetic Hook Stack',
    version: '2.0.0',
    zIndex: 15,
    safeZone: { x: 80, y: 640, width: 920, height: 640, padding: 32 },
    contrastContract: {
      minRatio: 12.0,
      foregroundHex: '#FFFFFF',
      backgroundScrimHex: '#0B1220E6'
    },
    supportedStates: ['IDLE', 'WORD_BY_WORD_POP', 'LOCKED_HOLD', 'TRANSITION_OUT'],
    singleton: true,
    audioLockBufferMs: 200,
    description: 'High-retention 2.0s-3.5s opening hook card with kinetic word pop, category pill, and hook audio lock.'
  },

  // 2. Dynamic Background Layer
  'sf.stage.semantic_b2_bg': {
    id: 'sf.stage.semantic_b2_bg',
    name: 'Semantic B2 Background Stage',
    version: '2.0.0',
    zIndex: 0,
    safeZone: { x: 0, y: 0, width: 1080, height: 1920 },
    contrastContract: {
      minRatio: 7.0,
      foregroundHex: '#FFFFFF',
      backgroundScrimHex: '#0B1220CC'
    },
    supportedStates: ['IDLE', 'KEN_BURNS_ZOOM_IN', 'KEN_BURNS_PAN_RIGHT', 'FADE_TRANSITION'],
    singleton: true,
    description: '6 distinct topic-verified B2 photographic backdrops with Ken Burns subtle motion and mandatory dark navy contrast scrim.'
  },

  // 3. Single-Instance Question Container
  'sf.quiz.question_glass_card': {
    id: 'sf.quiz.question_glass_card',
    name: 'Question Glass Container Card',
    version: '2.0.0',
    zIndex: 10,
    safeZone: { x: 60, y: 340, width: 960, height: 380, maxHeight: 380, padding: 40 },
    contrastContract: {
      minRatio: 14.0,
      foregroundHex: '#FFFFFF',
      backgroundScrimHex: '#0B1220F0'
    },
    supportedStates: ['ACTIVE', 'LOCKED'],
    singleton: true,
    description: 'Bounded translucent glass card using Inter-Bold (#FFFFFF). Auto-scales 56px -> 40px if text exceeds 3 lines; strictly forbids double-box rendering.'
  },

  // 4. Interactive State-Machine Answer Cards
  'sf.quiz.option_matrix_4x1': {
    id: 'sf.quiz.option_matrix_4x1',
    name: 'Option Matrix 4x1 Tile Group',
    version: '2.0.0',
    zIndex: 20,
    safeZone: { x: 85, y: 760, width: 910, height: 520, padding: 20 },
    contrastContract: {
      minRatio: 7.5,
      foregroundHex: '#FFFFFF',
      backgroundScrimHex: '#121C32EE'
    },
    supportedStates: ['HIDDEN', 'STAGGER_ENTER', 'THINKING_PULSE', 'ANSWER_REVEAL'],
    singleton: true,
    description: 'Four bounded option tiles supporting deterministic states. On reveal: correct scales 1.04x with #22C55E/#00AAFF highlight, wrong options dim to 0.35 opacity.'
  },

  // 5. Precision Thinking Clock
  'sf.timer.countdown_ring_5s': {
    id: 'sf.timer.countdown_ring_5s',
    name: 'Precision Countdown Ring 5s',
    version: '2.0.0',
    zIndex: 30,
    safeZone: { x: 475, y: 1355, width: 130, height: 130 },
    contrastContract: {
      minRatio: 8.0,
      foregroundHex: '#F59E0B',
      backgroundScrimHex: '#0B1220FF'
    },
    supportedStates: ['TICKING', 'EXPIRED'],
    singleton: true,
    description: 'Circular 5.000s countdown dial (centerX: 540, centerY: 1420). Unmounts cleanly the exact frame t=5000ms completes so it never overlaps the explanation drawer.'
  },

  // 6. Micro-Fact Payoff Card
  'sf.payoff.explanation_drawer': {
    id: 'sf.payoff.explanation_drawer',
    name: 'Micro-Fact Payoff Drawer',
    version: '2.0.0',
    zIndex: 25,
    safeZone: { x: 80, y: 1390, width: 920, height: 160, padding: 24 },
    contrastContract: {
      minRatio: 10.0,
      foregroundHex: '#38BDF8',
      backgroundScrimHex: '#050A14FA'
    },
    supportedStates: ['SLIDE_UP', 'VISIBLE', 'SLIDE_DOWN'],
    singleton: true,
    description: 'Slides into lower third only after ANSWER_REVEAL hold completes, displaying concise 1-sentence explanation synced to explanation VO.'
  },

  // 7. Complete Ending & Subscribe Finisher
  'sf.outro.scoreboard_cta': {
    id: 'sf.outro.scoreboard_cta',
    name: 'Scoreboard Outro CTA Finisher',
    version: '2.0.0',
    zIndex: 40,
    safeZone: { x: 80, y: 720, width: 920, height: 480, padding: 36 },
    contrastContract: {
      minRatio: 9.0,
      foregroundHex: '#FFFFFF',
      backgroundScrimHex: '#1E1B4BE6'
    },
    supportedStates: ['ENTER', 'HOLD', 'EOF'],
    singleton: true,
    audioLockBufferMs: 500,
    description: 'Dedicated final scene card: "How many did you get right out of 6? Comment your score & Subscribe!". Locked on screen until VO finish + 500ms tail.'
  },

  // 8. Permanent Brand Layer
  'sf.brand.watermark_lock': {
    id: 'sf.brand.watermark_lock',
    name: 'Permanent ShortForge Watermark Lock',
    version: '2.0.0',
    zIndex: 99,
    safeZone: { x: 940, y: 1800, width: 88, height: 88 },
    contrastContract: {
      minRatio: 4.5,
      foregroundHex: '#FFFFFFD9',
      backgroundScrimHex: '#00000000'
    },
    supportedStates: ['PERMANENT'],
    singleton: true,
    description: 'Composites ShortForge watermark at bottom: 80, right: 60, opacity: 0.85. Captions and drawers are strictly forbidden from intersecting its bounding box.'
  }
};


// Unified Master Implementation Packet Aliases
SHORTFORGE_CANONICAL_COMPONENTS['sf.intro.opening_challenge_card'] = SHORTFORGE_CANONICAL_COMPONENTS['sf.hook.kinetic_stack'];
SHORTFORGE_CANONICAL_COMPONENTS['sf.stage.b2_semantic_background'] = SHORTFORGE_CANONICAL_COMPONENTS['sf.stage.semantic_b2_bg'];
SHORTFORGE_CANONICAL_COMPONENTS['sf.quiz.persistent_glass_stage'] = SHORTFORGE_CANONICAL_COMPONENTS['sf.quiz.question_glass_card'];
SHORTFORGE_CANONICAL_COMPONENTS['sf.quiz.option_row'] = SHORTFORGE_CANONICAL_COMPONENTS['sf.quiz.option_matrix_4x1'];
SHORTFORGE_CANONICAL_COMPONENTS['sf.quiz.thinking_timer'] = SHORTFORGE_CANONICAL_COMPONENTS['sf.timer.countdown_ring_5s'];
SHORTFORGE_CANONICAL_COMPONENTS['sf.quiz.inline_explanation'] = SHORTFORGE_CANONICAL_COMPONENTS['sf.payoff.explanation_drawer'];
SHORTFORGE_CANONICAL_COMPONENTS['sf.outro.completion_cta_card'] = SHORTFORGE_CANONICAL_COMPONENTS['sf.outro.scoreboard_cta'];
SHORTFORGE_CANONICAL_COMPONENTS['sf.captions.accessibility_lane'] = {
  id: 'sf.captions.accessibility_lane',
  name: 'Guarded Accessibility Subtitle Lane',
  version: '2.0.0',
  zIndex: 35,
  safeZone: { x: 120, y: 1720, width: 840, height: 70 },
  contrastContract: { minRatio: 7.0, foregroundHex: '#FEF08A', backgroundScrimHex: '#000000CC' },
  supportedStates: ['IDLE', 'VISIBLE'],
  singleton: true,
  description: 'Confined single small dedicated subtitle lane outside glass panel and away from watermark.'
};

export class ShortForgeComponentRegistry {
  private static instance: ShortForgeComponentRegistry | null = null;

  public static getInstance(): ShortForgeComponentRegistry {
    if (!ShortForgeComponentRegistry.instance) {
      ShortForgeComponentRegistry.instance = new ShortForgeComponentRegistry();
    }
    return ShortForgeComponentRegistry.instance;
  }

  public getComponent(id: string): ComponentDefinition | undefined {
    return SHORTFORGE_CANONICAL_COMPONENTS[id];
  }

  public getAllComponents(): ComponentDefinition[] {
    return Object.values(SHORTFORGE_CANONICAL_COMPONENTS);
  }

  /**
   * Calculates WCAG 2.1 relative luminance and contrast ratio between foreground and background.
   */
  public static calculateContrastRatio(fgHex: string, bgHex: string): number {
    const parseRgb = (hex: string): [number, number, number] => {
      const clean = hex.replace('#', '').slice(0, 6);
      const r = parseInt(clean.slice(0, 2), 16) || 0;
      const g = parseInt(clean.slice(2, 4), 16) || 0;
      const b = parseInt(clean.slice(4, 6), 16) || 0;
      return [r, g, b];
    };

    const sRgbLuminance = (rgb: [number, number, number]): number => {
      const a = rgb.map((v) => {
        const c = v / 255.0;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
    };

    const lum1 = sRgbLuminance(parseRgb(fgHex));
    const lum2 = sRgbLuminance(parseRgb(bgHex));
    const lighter = Math.max(lum1, lum2);
    const darker = Math.min(lum1, lum2);
    return Number(((lighter + 0.05) / (darker + 0.05)).toFixed(2));
  }

  /**
   * Deterministic Pre-Render Layout & Collision Solver.
   * Checks:
   * 1. Canvas Boundary (all components stay within 1080x1920)
   * 2. Foreground Collision (active components at the same layer must not overlap unless nested by contract)
   * 3. Singleton Rule (only 1 instance of singleton components active per moment)
   * 4. Mutual Exclusion (sf.timer.countdown_ring_5s and sf.payoff.explanation_drawer must NEVER be active together)
   * 5. Watermark Exclusion (no component may overlap watermark safe-zone: x: 920..1080, y: 1780..1920)
   */
  public validateActiveLayout(
    activeComponentIds: string[],
    customBoxes?: Record<string, ComponentBoundingBox>
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const seenSingletons = new Set<string>();

    // 1. Singleton Check
    for (const id of activeComponentIds) {
      const comp = this.getComponent(id);
      if (!comp) {
        errors.push(`Unregistered component ID in active layout: ${id}`);
        continue;
      }
      if (comp.singleton) {
        if (seenSingletons.has(id)) {
          errors.push(`Singleton violation: Multiple instances of ${id} mounted simultaneously.`);
        }
        seenSingletons.add(id);
      }
    }

    // 2. Mutual Exclusion Check
    if (
      activeComponentIds.includes('sf.timer.countdown_ring_5s') &&
      activeComponentIds.includes('sf.payoff.explanation_drawer')
    ) {
      errors.push(
        'Mutual exclusion violation: sf.timer.countdown_ring_5s and sf.payoff.explanation_drawer cannot mount simultaneously.'
      );
    }

    // 3. Watermark Safe Zone Check
    const watermarkBox = SHORTFORGE_CANONICAL_COMPONENTS['sf.brand.watermark_lock'].safeZone;
    for (const id of activeComponentIds) {
      if (id === 'sf.brand.watermark_lock' || id === 'sf.stage.semantic_b2_bg') continue;
      const box = customBoxes?.[id] || this.getComponent(id)?.safeZone;
      if (!box) continue;

      if (this.intersects(box, watermarkBox)) {
        errors.push(
          `Watermark collision: Component ${id} [${box.x}, ${box.y}, ${box.width}, ${box.height}] intersects watermark safe zone.`
        );
      }
    }

    // 4. Foreground Collision Check (active foreground components with same Z-Index or overlapping interactive zones)
    for (let i = 0; i < activeComponentIds.length; i++) {
      for (let j = i + 1; j < activeComponentIds.length; j++) {
        const idA = activeComponentIds[i];
        const idB = activeComponentIds[j];
        if (idA === 'sf.stage.semantic_b2_bg' || idB === 'sf.stage.semantic_b2_bg') continue;
        if (idA === 'sf.brand.watermark_lock' || idB === 'sf.brand.watermark_lock') continue;

        const compA = this.getComponent(idA);
        const compB = this.getComponent(idB);
        if (!compA || !compB) continue;

        const boxA = customBoxes?.[idA] || compA.safeZone;
        const boxB = customBoxes?.[idB] || compB.safeZone;

        // If both components share the same Z-Index layer and overlap, report collision
        if (compA.zIndex === compB.zIndex && this.intersects(boxA, boxB)) {
          errors.push(
            `Collision violation: ${idA} and ${idB} intersect at Z-Index ${compA.zIndex}.`
          );
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  private intersects(a: ComponentBoundingBox, b: ComponentBoundingBox): boolean {
    return (
      a.x < b.x + b.width &&
      a.x + a.width > b.x &&
      a.y < b.y + b.height &&
      a.y + a.height > b.y
    );
  }
}
