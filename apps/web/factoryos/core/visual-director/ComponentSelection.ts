/**
 * ComponentSelection — Editorial Component Binding Contract
 * 
 * Maps a storybeat to a qualified visual component from the Component Registry.
 * Specifies layer positioning, frame-accurate entry/exit timing, and component parameters
 * with explicit semantic justification.
 */

export interface ComponentTimingWindow {
  startFrame: number;
  endFrame: number;
  entryTransition?: "none" | "fade_in" | "slide_up" | "pop_in";
  exitTransition?: "none" | "fade_out" | "slide_down";
  transitionFrames?: number;
}

export interface ComponentSelection {
  id: string;
  storybeatId: string;
  componentId: string;
  role: "background" | "container" | "badge" | "progress" | "indicator" | "overlay" | "cta";
  layerIndex: number;
  timing: ComponentTimingWindow;
  parameters: Record<string, any>;
  justification: string;
}

export function createComponentSelection(params: {
  id: string;
  storybeatId: string;
  componentId: string;
  role: ComponentSelection["role"];
  layerIndex: number;
  startFrame: number;
  endFrame: number;
  parameters?: Record<string, any>;
  justification: string;
}): ComponentSelection {
  return {
    id: params.id,
    storybeatId: params.storybeatId,
    componentId: params.componentId,
    role: params.role,
    layerIndex: params.layerIndex,
    timing: {
      startFrame: params.startFrame,
      endFrame: params.endFrame,
      entryTransition: "fade_in",
      exitTransition: "none",
      transitionFrames: 5,
    },
    parameters: params.parameters || {},
    justification: params.justification,
  };
}

