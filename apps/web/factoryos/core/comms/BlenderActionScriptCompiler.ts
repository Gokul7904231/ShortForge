/**
 * Constrained Blender semantic-action compiler.
 *
 * Normal Blender mutations are represented as typed data and compiled into
 * small, deterministic bpy scripts. This prevents Ascalon from smuggling
 * arbitrary Python through an ordinary semantic action.
 *
 * Unsupported/advanced operations must use the separate RAW_PYTHON path.
 */

import type { BlenderSemanticAction } from "./BlenderMcpContracts";

export class BlenderStructuredActionError extends Error {
  public readonly code = "BLENDER_STRUCTURED_ACTION_INVALID";
}

function fail(message: string): never {
  throw new BlenderStructuredActionError(message);
}

function stringArg(args: Record<string, unknown>, key: string, required = false): string | undefined {
  const value = args[key];
  if (value === undefined || value === null) {
    if (required) fail(`Missing required structured Blender argument '${key}'`);
    return undefined;
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    fail(`Blender argument '${key}' must be a non-empty string`);
  }
  return value;
}

function numberArg(args: Record<string, unknown>, key: string): number | undefined {
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`Blender argument '${key}' must be a finite number`);
  }
  return value;
}

function boolArg(args: Record<string, unknown>, key: string): boolean | undefined {
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "boolean") fail(`Blender argument '${key}' must be boolean`);
  return value;
}

function vectorArg(
  args: Record<string, unknown>,
  key: string,
  length = 3,
): number[] | undefined {
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  if (
    !Array.isArray(value) ||
    value.length !== length ||
    value.some((entry) => typeof entry !== "number" || !Number.isFinite(entry))
  ) {
    fail(`Blender argument '${key}' must be an array of ${length} finite numbers`);
  }
  return value as number[];
}

function stringArrayArg(args: Record<string, unknown>, key: string, required = false): string[] {
  const value = args[key];
  if (value === undefined || value === null) {
    if (required) fail(`Missing required Blender argument '${key}'`);
    return [];
  }
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || !entry.trim())) {
    fail(`Blender argument '${key}' must be a non-empty string array`);
  }
  return value as string[];
}

function safeRelativePath(value: string): string {
  if (value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value) || value.includes("\0")) {
    fail("Blender render/export paths must be relative to the worker job directory");
  }
  const normalized = value.replaceAll("\\", "/");
  if (normalized.split("/").includes("..")) {
    fail("Blender render/export path traversal is forbidden");
  }
  return normalized;
}

function json(value: unknown): string {
  return JSON.stringify(value);
}

function compileObjectCreate(args: Record<string, unknown>): string {
  const primitive = stringArg(args, "primitive", true)!.toUpperCase();
  const allowed: Record<string, string> = {
    CUBE: "cube",
    UV_SPHERE: "uv_sphere",
    ICO_SPHERE: "ico_sphere",
    CYLINDER: "cylinder",
    CONE: "cone",
    TORUS: "torus",
    PLANE: "plane",
    CIRCLE: "circle",
    GRID: "grid",
    MONKEY: "monkey",
  };
  const operator = allowed[primitive];
  if (!operator) fail(`Unsupported OBJECT_CREATE primitive '${primitive}'`);

  const location = vectorArg(args, "location") || [0, 0, 0];
  const rotation = vectorArg(args, "rotation") || [0, 0, 0];
  const scale = vectorArg(args, "scale") || [1, 1, 1];
  const name = stringArg(args, "name");

  return [
    "import bpy",
    `bpy.ops.mesh.primitive_${operator}_add(location=${json(location)}, rotation=${json(rotation)})`,
    `obj = bpy.context.active_object`,
    `obj.scale = ${json(scale)}`,
    ...(name ? [`obj.name = ${json(name)}`, `obj.data.name = ${json(name + "_mesh")}`] : []),
  ].join("\n");
}

function compileObjectUpdate(args: Record<string, unknown>): string {
  const objectName = stringArg(args, "objectName", true)!;
  const location = vectorArg(args, "location");
  const rotation = vectorArg(args, "rotation");
  const scale = vectorArg(args, "scale");

  if (!location && !rotation && !scale) fail("OBJECT_UPDATE requires at least one transform field");

  return [
    "import bpy",
    `obj = bpy.data.objects.get(${json(objectName)})`,
    "if obj is None: raise RuntimeError('OBJECT_NOT_FOUND')",
    ...(location ? [`obj.location = ${json(location)}`] : []),
    ...(rotation ? [`obj.rotation_euler = ${json(rotation)}`] : []),
    ...(scale ? [`obj.scale = ${json(scale)}`] : []),
  ].join("\n");
}

function compileObjectDelete(args: Record<string, unknown>): string {
  const names = stringArrayArg(args, "objectNames", true);
  return [
    "import bpy",
    `names = ${json(names)}`,
    "for name in names:",
    "    obj = bpy.data.objects.get(name)",
    "    if obj is not None:",
    "        bpy.data.objects.remove(obj, do_unlink=True)",
  ].join("\n");
}

function compileMaterialUpdate(args: Record<string, unknown>): string {
  const objectName = stringArg(args, "objectName", true)!;
  const materialName = stringArg(args, "materialName") || `${objectName}_Material`;
  const baseColor = vectorArg(args, "baseColor", 4);
  const metallic = numberArg(args, "metallic");
  const roughness = numberArg(args, "roughness");

  if (!baseColor && metallic === undefined && roughness === undefined) {
    fail("MATERIAL_UPDATE requires baseColor, metallic, or roughness");
  }

  return [
    "import bpy",
    `obj = bpy.data.objects.get(${json(objectName)})`,
    "if obj is None: raise RuntimeError('OBJECT_NOT_FOUND')",
    `mat = bpy.data.materials.get(${json(materialName)}) or bpy.data.materials.new(${json(materialName)})`,
    "mat.use_nodes = True",
    "bsdf = mat.node_tree.nodes.get('Principled BSDF')",
    "if bsdf is None: raise RuntimeError('PRINCIPLED_BSDF_NOT_FOUND')",
    ...(baseColor ? [`bsdf.inputs['Base Color'].default_value = ${json(baseColor)}`] : []),
    ...(metallic !== undefined ? [`bsdf.inputs['Metallic'].default_value = ${metallic}`] : []),
    ...(roughness !== undefined ? [`bsdf.inputs['Roughness'].default_value = ${roughness}`] : []),
    "if obj.data and hasattr(obj.data, 'materials'):",
    "    if len(obj.data.materials) == 0: obj.data.materials.append(mat)",
    "    else: obj.data.materials[0] = mat",
  ].join("\n");
}

function compileCameraConfigure(args: Record<string, unknown>): string {
  const cameraName = stringArg(args, "cameraName", true)!;
  const location = vectorArg(args, "location");
  const rotation = vectorArg(args, "rotation");
  const lens = numberArg(args, "lens");
  const clipStart = numberArg(args, "clipStart");
  const clipEnd = numberArg(args, "clipEnd");

  if (!location && !rotation && lens === undefined && clipStart === undefined && clipEnd === undefined) {
    fail("CAMERA_CONFIGURE requires at least one camera field");
  }

  return [
    "import bpy",
    `obj = bpy.data.objects.get(${json(cameraName)})`,
    "if obj is None or obj.type != 'CAMERA': raise RuntimeError('CAMERA_NOT_FOUND')",
    ...(location ? [`obj.location = ${json(location)}`] : []),
    ...(rotation ? [`obj.rotation_euler = ${json(rotation)}`] : []),
    ...(lens !== undefined ? [`obj.data.lens = ${lens}`] : []),
    ...(clipStart !== undefined ? [`obj.data.clip_start = ${clipStart}`] : []),
    ...(clipEnd !== undefined ? [`obj.data.clip_end = ${clipEnd}`] : []),
    `bpy.context.scene.camera = obj`,
  ].join("\n");
}

function compileLightingConfigure(args: Record<string, unknown>): string {
  const name = stringArg(args, "name", true)!;
  const type = stringArg(args, "type", true)!.toUpperCase();
  const allowed = new Set(["POINT", "SUN", "SPOT", "AREA"]);
  if (!allowed.has(type)) fail(`Unsupported light type '${type}'`);

  const energy = numberArg(args, "energy");
  const location = vectorArg(args, "location");
  const rotation = vectorArg(args, "rotation");
  const color = vectorArg(args, "color", 3);
  const size = numberArg(args, "size");

  return [
    "import bpy",
    `data = bpy.data.lights.get(${json(name)}) or bpy.data.lights.new(name=${json(name)}, type=${json(type)})`,
    `obj = bpy.data.objects.get(${json(name)})`,
    "if obj is None:",
    `    obj = bpy.data.objects.new(${json(name)}, data)`,
    "    bpy.context.scene.collection.objects.link(obj)",
    ...(energy !== undefined ? [`data.energy = ${energy}`] : []),
    ...(location ? [`obj.location = ${json(location)}`] : []),
    ...(rotation ? [`obj.rotation_euler = ${json(rotation)}`] : []),
    ...(color ? [`data.color = ${json(color)}`] : []),
    ...(size !== undefined && type === "AREA" ? [`data.shape = 'DISK'`, `data.size = ${size}`] : []),
  ].join("\n");
}

function compileAnimationConfigure(args: Record<string, unknown>): string {
  const objectName = stringArg(args, "objectName", true)!;
  const keyframes = args.keyframes;
  if (!Array.isArray(keyframes) || keyframes.length === 0) {
    fail("ANIMATION_CONFIGURE requires a non-empty keyframes array");
  }

  const sanitized = keyframes.map((frame) => {
    if (!frame || typeof frame !== "object") fail("Each keyframe must be an object");
    const record = frame as Record<string, unknown>;
    if (!Number.isInteger(record.frame)) fail("Each keyframe requires integer frame");
    const location = vectorArg(record, "location");
    const rotation = vectorArg(record, "rotation");
    const scale = vectorArg(record, "scale");
    if (!location && !rotation && !scale) fail("Each keyframe requires location, rotation, or scale");
    return { frame: record.frame, location, rotation, scale };
  });

  const lines = [
    "import bpy",
    `obj = bpy.data.objects.get(${json(objectName)})`,
    "if obj is None: raise RuntimeError('OBJECT_NOT_FOUND')",
  ];

  for (const frame of sanitized) {
    if (frame.location) {
      lines.push(
        `obj.location = ${json(frame.location)}`,
        `obj.keyframe_insert(data_path='location', frame=${frame.frame})`,
      );
    }
    if (frame.rotation) {
      lines.push(
        `obj.rotation_euler = ${json(frame.rotation)}`,
        `obj.keyframe_insert(data_path='rotation_euler', frame=${frame.frame})`,
      );
    }
    if (frame.scale) {
      lines.push(
        `obj.scale = ${json(frame.scale)}`,
        `obj.keyframe_insert(data_path='scale', frame=${frame.frame})`,
      );
    }
  }

  return lines.join("\n");
}

function compileRender(args: Record<string, unknown>): string {
  const output = stringArg(args, "outputRelativePath", true)!;
  const safePath = safeRelativePath(output);
  const engine = stringArg(args, "engine");
  const allowedEngines = new Set(["BLENDER_EEVEE_NEXT", "BLENDER_WORKBENCH", "CYCLES"]);
  if (engine && !allowedEngines.has(engine)) fail(`Unsupported render engine '${engine}'`);

  const resolutionX = numberArg(args, "resolutionX");
  const resolutionY = numberArg(args, "resolutionY");
  const percentage = numberArg(args, "resolutionPercentage");
  const frame = numberArg(args, "frame");
  const fps = numberArg(args, "fps");

  const lines = [
    "import bpy",
    "scene = bpy.context.scene",
    `scene.render.filepath = bpy.path.abspath(${json('//' + safePath)})`,
    ...(engine ? [`scene.render.engine = ${json(engine)}`] : []),
    ...(resolutionX !== undefined ? [`scene.render.resolution_x = ${resolutionX}`] : []),
    ...(resolutionY !== undefined ? [`scene.render.resolution_y = ${resolutionY}`] : []),
    ...(percentage !== undefined ? [`scene.render.resolution_percentage = ${percentage}`] : []),
    ...(fps !== undefined ? [`scene.render.fps = ${fps}`] : []),
    ...(frame !== undefined ? [`scene.frame_set(${frame})`] : []),
    "bpy.ops.render.render(write_still=True)",
  ];
  return lines.join("\n");
}

export function compileStructuredBlenderAction(
  action: BlenderSemanticAction,
  args: Record<string, unknown>,
): { code: string; userPrompt?: string } {
  const userPrompt = typeof args.user_prompt === "string" ? args.user_prompt : undefined;

  switch (action) {
    case "OBJECT_CREATE":
      return { code: compileObjectCreate(args), userPrompt };
    case "OBJECT_UPDATE":
      return { code: compileObjectUpdate(args), userPrompt };
    case "OBJECT_DELETE":
      return { code: compileObjectDelete(args), userPrompt };
    case "MATERIAL_UPDATE":
      return { code: compileMaterialUpdate(args), userPrompt };
    case "CAMERA_CONFIGURE":
      return { code: compileCameraConfigure(args), userPrompt };
    case "LIGHTING_CONFIGURE":
      return { code: compileLightingConfigure(args), userPrompt };
    case "ANIMATION_CONFIGURE":
      return { code: compileAnimationConfigure(args), userPrompt };
    case "RENDER":
      return { code: compileRender(args), userPrompt };
    default:
      fail(`No constrained compiler exists for Blender action '${action}'. Use explicit PYTHON_EXECUTE only when separately authorized.`);
  }
}
