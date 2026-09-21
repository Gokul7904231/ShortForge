import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { TemplateRegistry } from "@/lib/templates/registry/TemplateRegistry";
import { ContentCategory, CapabilityStatus } from "@/lib/templates/schemas/TemplateSchema";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category") as ContentCategory | null;
    const status = searchParams.get("status") as CapabilityStatus | null;
    const search = searchParams.get("search");

    const registry = TemplateRegistry.getInstance();

    // Also load and migrate any saved custom templates
    const dataDir = path.resolve(process.cwd(), "data");
    const customFilePath = path.join(dataDir, "custom-templates.json");
    if (fs.existsSync(customFilePath)) {
      try {
        const rawCustom = JSON.parse(fs.readFileSync(customFilePath, "utf-8"));
        if (Array.isArray(rawCustom)) {
          for (const item of rawCustom) {
            if (item.identity && item.storyStructure) {
              registry.registerTemplate(item);
            } else {
              const migrated = registry.migrateLegacyTemplate(item);
              registry.registerTemplate(migrated);
            }
          }
        }
      } catch (err) {
        console.warn("[TemplatesAPI] Failed to parse custom-templates.json:", err);
      }
    }

    const templates = registry.listTemplates({
      category: category || undefined,
      capabilityStatus: status || undefined,
      search: search || undefined
    });

    // Provide dual-format: modern rich TemplateDefinition + backwards compatible fields
    const formatted = templates.map(t => ({
      ...t,
      // Backwards compatible fields
      id: t.identity.id,
      name: t.identity.name,
      prompt: t.inputContract.promptSeed || t.description,
      variables: t.inputContract.variables.map(v => v.name).join(", "),
      stepCount: t.storyStructure.length,
      isOfficial: t.identity.isSystem,
      version: t.identity.version
    }));

    return NextResponse.json({
      success: true,
      count: formatted.length,
      templates: formatted
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const registry = TemplateRegistry.getInstance();

    let templateDef;
    if (body.identity && body.storyStructure) {
      templateDef = body;
    } else {
      // Migrate legacy custom builder submission
      templateDef = registry.migrateLegacyTemplate({
        id: body.id || `custom_${Date.now()}`,
        name: body.name,
        category: body.category,
        description: body.description,
        promptSeed: body.prompt || body.promptSeed,
        version: body.version || "1.0.0"
      });
    }

    const regResult = registry.registerTemplate(templateDef);
    if (!regResult.success) {
      return NextResponse.json({ success: false, error: regResult.error }, { status: 400 });
    }

    // Persist to custom-templates.json
    const dataDir = path.resolve(process.cwd(), "data");
    osEnsureDir(dataDir);
    const customFilePath = path.join(dataDir, "custom-templates.json");
    let existingCustom: any[] = [];
    if (fs.existsSync(customFilePath)) {
      try {
        existingCustom = JSON.parse(fs.readFileSync(customFilePath, "utf-8"));
      } catch {}
    }
    existingCustom.push(templateDef);
    fs.writeFileSync(customFilePath, JSON.stringify(existingCustom, null, 2), "utf-8");

    return NextResponse.json({
      success: true,
      template: {
        ...templateDef,
        id: templateDef.identity.id,
        name: templateDef.identity.name,
        prompt: templateDef.inputContract.promptSeed,
        variables: templateDef.inputContract.variables.map((v: any) => v.name).join(", "),
        stepCount: templateDef.storyStructure.length,
        version: templateDef.identity.version
      }
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

function osEnsureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
