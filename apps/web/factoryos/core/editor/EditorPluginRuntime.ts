import type {
  EditorCommand,
  EditorDocument,
  EditorPluginAdmission,
  EditorPluginManifest,
  EditorReceipt,
  ShortForgeEditorAPI,
} from "./EditorContracts";

export interface EditorPluginCommandFactoryInput {
  readonly document: EditorDocument;
  readonly arguments: Readonly<Record<string, unknown>>;
}

export interface EditorPluginDefinition {
  readonly manifest: EditorPluginManifest;
  readonly createCommand: (
    input: EditorPluginCommandFactoryInput,
  ) => EditorCommand;
}

export interface ApplyPluginCommandInput {
  readonly sessionId: string;
  readonly commandId: string;
  readonly expectedRevision: number;
  readonly actor: EditorPluginActor;
  readonly pluginId: string;
  readonly arguments: Readonly<Record<string, unknown>>;
}

export type EditorPluginActor =
  | { readonly kind: "HUMAN"; readonly id: string }
  | { readonly kind: "AGENT"; readonly id: string }
  | { readonly kind: "SYSTEM"; readonly id: string };

function requiredCapability(command: EditorCommand): EditorPluginManifest["capabilities"][number] | null {
  switch (command.type) {
    case "ADD_EFFECT":
      return "EFFECT";
    case "ADD_MASK":
      return "MASK";
    case "SET_TRANSITION":
      return "TRANSITION";
    default:
      return null;
  }
}

export class EditorPluginRuntime {
  private readonly plugins = new Map<string, EditorPluginDefinition>();

  constructor(private readonly editor: ShortForgeEditorAPI) {}

  register(definition: EditorPluginDefinition): EditorPluginAdmission {
    const { manifest } = definition;
    if (!manifest.pluginId || !manifest.version || manifest.apiVersion !== "1.0.0") {
      return {
        pluginId: manifest.pluginId,
        admitted: false,
        authority: "SHORTFORGE_OKF",
        reason: "EDITOR_PLUGIN_INVALID_MANIFEST",
      };
    }

    if (!manifest.deterministic) {
      return {
        pluginId: manifest.pluginId,
        admitted: false,
        authority: "SHORTFORGE_OKF",
        reason: "EDITOR_PLUGIN_NON_DETERMINISTIC",
      };
    }

    if (!manifest.permissions.includes("WRITE_COMPOSITION")) {
      return {
        pluginId: manifest.pluginId,
        admitted: false,
        authority: "SHORTFORGE_OKF",
        reason: "EDITOR_PLUGIN_WRITE_PERMISSION_REQUIRED",
      };
    }

    if (manifest.sandbox === "ISOLATED") {
      return {
        pluginId: manifest.pluginId,
        admitted: false,
        authority: "SHORTFORGE_OKF",
        reason: "EDITOR_PLUGIN_ISOLATED_HOST_NOT_CONFIGURED",
      };
    }

    if (this.plugins.has(manifest.pluginId)) {
      return {
        pluginId: manifest.pluginId,
        admitted: false,
        authority: "SHORTFORGE_OKF",
        reason: "EDITOR_PLUGIN_ALREADY_REGISTERED",
      };
    }

    this.plugins.set(manifest.pluginId, definition);
    return {
      pluginId: manifest.pluginId,
      admitted: true,
      authority: "SHORTFORGE_OKF",
    };
  }

  admit(pluginId: string): EditorPluginAdmission {
    const plugin = this.plugins.get(pluginId);
    return plugin
      ? {
          pluginId,
          admitted: true,
          authority: "SHORTFORGE_OKF",
        }
      : {
          pluginId,
          admitted: false,
          authority: "SHORTFORGE_OKF",
          reason: "EDITOR_PLUGIN_NOT_REGISTERED",
        };
  }

  async apply(input: ApplyPluginCommandInput): Promise<EditorReceipt> {
    const plugin = this.plugins.get(input.pluginId);
    if (!plugin) {
      throw new Error("EDITOR_PLUGIN_NOT_REGISTERED");
    }

    const admission = this.admit(input.pluginId);
    if (!admission.admitted) {
      throw new Error(admission.reason || "EDITOR_PLUGIN_NOT_ADMITTED");
    }

    const document = await this.editor.getDocument(input.sessionId);
    const command = plugin.createCommand({
      document,
      arguments: input.arguments,
    });

    const capability = requiredCapability(command);
    if (capability && !plugin.manifest.capabilities.includes(capability)) {
      throw new Error(`EDITOR_PLUGIN_CAPABILITY_MISMATCH:${capability}`);
    }

    return this.editor.apply({
      commandId: input.commandId,
      sessionId: input.sessionId,
      expectedRevision: input.expectedRevision,
      actor: input.actor,
      command,
    });
  }
}
