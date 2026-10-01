/** ShortForge programmable ComfyUI transformation recipes.
 * Recipes are trusted workflow blueprints. Agents select recipe IDs; they never
 * author arbitrary ComfyUI graphs in the production path.
 */
export type ComfyVisualTransformOperation =
  | "UPSCALE_2X"
  | "IMG2IMG_RESTYLE"
  | "INPAINT"
  | "OUTPAINT_9_16"
  | "DETAIL_ENHANCE";

export interface ComfyTransformRecipe {
  readonly recipeId: string;
  readonly version: string;
  readonly operation: ComfyVisualTransformOperation;
  readonly description: string;
  readonly workflowTemplate: Record<string, unknown>;
  readonly requiredModels?: readonly string[];
  readonly inputNodeId: string;
  readonly inputField: string;
  readonly outputNodeId: string;
  readonly outputField: string;
  readonly parameterBindings: Readonly<Record<string, { readonly nodeId: string; readonly field: string }>>;
}

const UPSCALE_2X_WORKFLOW: Record<string, unknown> = {
  "1": { class_type: "LoadImage", inputs: { image: "__SHORTFORGE_INPUT_IMAGE__" } },
  "2": { class_type: "UpscaleModelLoader", inputs: { model_name: "__SHORTFORGE_UPSCALE_MODEL__" } },
  "3": { class_type: "ImageUpscaleWithModel", inputs: { upscale_model: ["2", 0], image: ["1", 0] } },
  "4": { class_type: "ImageScaleBy", inputs: { upscale_method: "lanczos", scale_by: 0.5, image: ["3", 0] } },
  "5": { class_type: "SaveImage", inputs: { filename_prefix: "__SHORTFORGE_OUTPUT_PREFIX__", images: ["4", 0] } }
};

export const COMFY_TRANSFORM_RECIPES: readonly ComfyTransformRecipe[] = [
  {
    recipeId: "upscale-2x-realesrgan",
    version: "1.0.0",
    operation: "UPSCALE_2X",
    description: "AI-upscale a retrieved visual using a 4x model and deterministic 2x final sizing.",
    workflowTemplate: UPSCALE_2X_WORKFLOW,
    requiredModels: ["4x-UltraSharp.pth"],
    inputNodeId: "1",
    inputField: "image",
    outputNodeId: "5",
    outputField: "filename_prefix",
    parameterBindings: {
      modelName: { nodeId: "2", field: "model_name" },
      outputPrefix: { nodeId: "5", field: "filename_prefix" }
    }
  }
];

export function getComfyTransformRecipe(recipeId: string): ComfyTransformRecipe | undefined {
  return COMFY_TRANSFORM_RECIPES.find(recipe => recipe.recipeId === recipeId);
}
