/** Governed ComfyUI-backed visual transformation engine.
 *
 * Transforms already-retrieved ShortForge visual assets. It is not the
 * canonical asset authority and it does not perform release verification.
 */
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { db } from "../../../lib/firebase-admin";
import { AssetCurator } from "../../../lib/visual-assets/AssetCurator";
import { getStorageProvider } from "../../../lib/visual-assets/StorageProvider";
import type { CandidateAsset } from "../../../lib/visual-assets/VisualIntelligenceTypes";
import { SelectedMcpGateway } from "../mcp/SelectedMcpGateway";
import { getComfyTransformRecipe, type ComfyVisualTransformOperation } from "./ComfyTransformRecipes";

export interface VisualTransformStep {
  readonly recipeId: string;
  readonly operation: ComfyVisualTransformOperation;
  readonly parameters?: Readonly<Record<string, unknown>>;
}

export interface VisualTransformRequest {
  readonly missionId: string;
  readonly jobId: string;
  readonly floorId: "floor04_media_synthesis" | "floor05_timeline_composition" | "floor06_rendering";
  readonly environment: "development" | "staging" | "production" | "test";
  readonly sourceAsset: CandidateAsset;
  readonly steps: readonly VisualTransformStep[];
  readonly guardianCertificateId: string;
}

export interface VisualTransformLineage {
  readonly transformationId: string;
  readonly parentAssetId: string;
  readonly parentSha256: string;
  readonly recipeId: string;
  readonly recipeVersion: string;
  readonly operation: ComfyVisualTransformOperation;
  readonly parametersSha256: string;
  readonly createdAt: string;
}

export interface VisualTransformResult {
  readonly asset: CandidateAsset;
  readonly lineage: readonly VisualTransformLineage[];
  readonly workflowDigestSha256: string;
  readonly sourceAssetSha256: string;
}

function sha256Json(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function readTransformRoot(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.COMFY_MCP_TRANSFORM_ROOT?.trim();
  return path.resolve(configured || path.join(process.cwd(), "data", "comfy-transform-runtime"));
}

function isWithin(candidate: string, roots: readonly string[]): boolean {
  const resolved = path.resolve(candidate);
  return roots.some(root => {
    const base = path.resolve(root);
    const prefix = base.endsWith(path.sep) ? base : base + path.sep;
    return resolved === base || resolved.startsWith(prefix);
  });
}

function collectRasterFiles(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  const out: string[] = [];
  const walk = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(png|jpe?g|webp)$/i.test(entry.name)) out.push(full);
    }
  };
  walk(root);
  return out.sort();
}

function extractPromptId(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const root = value as Record<string, unknown>;
  const candidates = [root, root.result];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const obj = candidate as Record<string, unknown>;
    for (const key of ["prompt_id", "promptId"]) {
      if (typeof obj[key] === "string" && obj[key].trim()) return obj[key] as string;
    }
  }
  return undefined;
}

function extractUploadedFilename(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const root = value as Record<string, unknown>;
  const candidates = [root, root.result];
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") continue;
    const obj = candidate as Record<string, unknown>;
    for (const key of ["filename", "name", "uploaded_filename"]) {
      if (typeof obj[key] === "string" && obj[key].trim()) return obj[key] as string;
    }
    if (Array.isArray(obj.files) && typeof obj.files[0] === "string") return obj.files[0];
  }
  return undefined;
}

export class ComfyVisualTransformEngine {
  private readonly gateway: SelectedMcpGateway;
  private readonly storage = getStorageProvider();

  constructor(gateway = new SelectedMcpGateway()) {
    this.gateway = gateway;
  }

  async transform(request: VisualTransformRequest): Promise<VisualTransformResult> {
    if (!request.sourceAsset.path || !fs.existsSync(request.sourceAsset.path)) {
      throw new Error("visual_transform_source_asset_path_missing");
    }
    if (!request.steps.length) throw new Error("visual_transform_steps_required");
    if (!request.guardianCertificateId.trim()) {
      throw new Error("visual_transform_guardian_certificate_required");
    }

    const root = readTransformRoot();
    const allowedRoots = (process.env.COMFY_MCP_ALLOWED_ROOTS || "")
      .split(",").map(value => value.trim()).filter(Boolean).map(value => path.resolve(value));
    if (!isWithin(root, allowedRoots)) {
      throw new Error("comfy_transform_root_must_be_inside_comfy_mcp_allowed_roots");
    }
    fs.mkdirSync(root, { recursive: true });

    let current = request.sourceAsset;
    const lineages: VisualTransformLineage[] = [];
    let workflowDigest = "";

    for (const step of request.steps) {
      const recipe = getComfyTransformRecipe(step.recipeId);
      if (!recipe) throw new Error("unknown_comfy_transform_recipe:" + step.recipeId);
      if (recipe.operation !== step.operation) throw new Error("recipe_operation_mismatch:" + step.recipeId);

      const parameters = {
        ...(step.parameters || {}),
        modelName: step.parameters?.modelName || recipe.requiredModels?.[0]
      };
      const transformationId = "tr_" + crypto.randomUUID();
      const jobRoot = path.join(root, request.jobId, transformationId);
      const inputRoot = path.join(jobRoot, "input");
      const outputRoot = path.join(jobRoot, "output");
      const workflowRoot = path.join(jobRoot, "workflow");
      fs.mkdirSync(inputRoot, { recursive: true });
      fs.mkdirSync(outputRoot, { recursive: true });
      fs.mkdirSync(workflowRoot, { recursive: true });

      const sourceExt = path.extname(current.path || "") || ".img";
      const stagedSource = path.join(inputRoot, "source" + sourceExt.toLowerCase());
      fs.copyFileSync(current.path!, stagedSource);

      const uploaded = await this.gateway.execute({
        serverId: "comfyui",
        action: "COMFY_UPLOAD_INPUT",
        missionId: request.missionId,
        jobId: request.jobId,
        floorId: request.floorId,
        environment: request.environment,
        arguments: { paths: [stagedSource], overwrite: false },
        guardianAuthorization: { granted: true, certificateId: request.guardianCertificateId }
      });

      if (!uploaded.success) throw new Error("comfy_input_stage_failed");
      const uploadedName = extractUploadedFilename(uploaded.result) || path.basename(stagedSource);

      const outputPrefix = "shortforge/" + request.jobId + "/" + transformationId;
      const workflow = JSON.parse(JSON.stringify(recipe.workflowTemplate)) as Record<string, any>;
      workflow[recipe.inputNodeId].inputs[recipe.inputField] = uploadedName;
      workflow[recipe.outputNodeId].inputs[recipe.outputField] = outputPrefix;

      const modelBinding = recipe.parameterBindings.modelName;
      if (modelBinding) {
        workflow[modelBinding.nodeId].inputs[modelBinding.field] =
          String(parameters.modelName || recipe.requiredModels?.[0] || "");
      }

      const workflowPath = path.join(workflowRoot, recipe.recipeId + ".api.json");
      fs.writeFileSync(workflowPath, JSON.stringify(workflow, null, 2), "utf8");
      workflowDigest = sha256Json(workflow);

      const serverInfo = await this.gateway.execute({
        serverId: "comfyui",
        action: "COMFY_SERVER_INFO",
        missionId: request.missionId,
        jobId: request.jobId,
        floorId: request.floorId,
        environment: request.environment,
        arguments: {}
      });
      if (!serverInfo.success) throw new Error("comfy_server_unavailable");

      const validation = await this.gateway.execute({
        serverId: "comfyui",
        action: "COMFY_VALIDATE_WORKFLOW",
        missionId: request.missionId,
        jobId: request.jobId,
        floorId: request.floorId,
        environment: request.environment,
        arguments: { workflow_path: workflowPath }
      });
      if (!validation.success) throw new Error("comfy_transform_workflow_validation_failed");

      const run = await this.gateway.execute({
        serverId: "comfyui",
        action: "COMFY_TRANSFORM_ASSET",
        missionId: request.missionId,
        jobId: request.jobId,
        floorId: request.floorId,
        environment: request.environment,
        arguments: { workflow_path: workflowPath, wait: false },
        guardianAuthorization: { granted: true, certificateId: request.guardianCertificateId }
      });
      if (!run.success) throw new Error("comfy_transform_execution_failed");

      const promptId = extractPromptId(run.result);
      if (!promptId) throw new Error("comfy_transform_prompt_id_missing");

      const wait = await this.gateway.execute({
        serverId: "comfyui",
        action: "COMFY_WAIT_JOB",
        missionId: request.missionId,
        jobId: request.jobId,
        floorId: request.floorId,
        environment: request.environment,
        arguments: { action: "wait", prompt_id: promptId, timeout_seconds: 120 },
        guardianAuthorization: { granted: true, certificateId: request.guardianCertificateId }
      });
      if (!wait.success) throw new Error("comfy_transform_wait_failed");

      const fetched = await this.gateway.execute({
        serverId: "comfyui",
        action: "COMFY_FETCH_TRANSFORM_OUTPUT",
        missionId: request.missionId,
        jobId: request.jobId,
        floorId: request.floorId,
        environment: request.environment,
        arguments: { prompt_id: promptId, out_dir: outputRoot, inline_images: false },
        guardianAuthorization: { granted: true, certificateId: request.guardianCertificateId }
      });
      if (!fetched.success) throw new Error("comfy_transform_output_fetch_failed");

      const outputs = collectRasterFiles(outputRoot);
      if (!outputs.length) throw new Error("comfy_transform_produced_no_raster_output");

      const raw = fs.readFileSync(outputs[0]);
      const validationReport = await AssetCurator.curate(raw, {
        title: current.title || "ShortForge transformed visual",
        tags: [...(current.tags || []), "comfyui", "derived", step.operation.toLowerCase()]
      });
      if (!validationReport.report.isValid) {
        throw new Error("comfy_transform_output_rejected:" + validationReport.report.reasons.join(";"));
      }

      const lineage: VisualTransformLineage = {
        transformationId,
        parentAssetId: current.id,
        parentSha256: current.sha256,
        recipeId: recipe.recipeId,
        recipeVersion: recipe.version,
        operation: recipe.operation,
        parametersSha256: sha256Json(parameters),
        createdAt: new Date().toISOString()
      };

      const derivedSha = validationReport.report.sha256;
      const storageKey = await this.storage.upload(
        "visual-packs/derived/" + request.sourceAsset.id + "/" + recipe.recipeId + "/" + derivedSha + ".webp",
        validationReport.optimizedBuffer,
        "image/webp"
      );
      const localPath = path.join(outputRoot, derivedSha + ".jpg");
      fs.writeFileSync(localPath, validationReport.optimizedBuffer);

      const derivedAsset = {
        ...current,
        id: "derived_" + derivedSha,
        storageKey,
        path: localPath,
        sha256: derivedSha,
        dhash: validationReport.report.dhash,
        width: validationReport.report.width,
        height: validationReport.report.height,
        qualityScore: validationReport.report.score,
        usageCount: 0,
        derivedFromAssetId: current.id,
        derivedFromSha256: current.sha256,
        transformation: lineage
      } as CandidateAsset;

      await db.collection("visual_assets").doc("derived_" + derivedSha).set({
        ...derivedAsset,
        derived: true,
        canonicalSourceAssetId: current.id,
        canonicalSourceSha256: current.sha256,
        transformation: lineage,
        lastUpdated: new Date().toISOString()
      });

      current = derivedAsset;
      lineages.push(lineage);
    }

    return {
      asset: current,
      lineage: lineages,
      workflowDigestSha256: workflowDigest,
      sourceAssetSha256: request.sourceAsset.sha256
    };
  }
}

export const __test = {
  sha256Json,
  collectRasterFiles,
  isWithin,
  readTransformRoot
};
