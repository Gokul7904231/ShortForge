import { NotebookRegistry } from "./NotebookRegistry";
import { KaggleNotebookAdapter } from "./KaggleNotebookAdapter";
import { ColabNotebookAdapter } from "./ColabNotebookAdapter";
import { PaperspaceNotebookAdapter } from "./PaperspaceNotebookAdapter";
import { LightningNotebookAdapter } from "./LightningNotebookAdapter";
import { HuggingFaceZeroGPUAdapter } from "./HuggingFaceZeroGPUAdapter";

export * from "./NotebookContracts";
export * from "./NotebookUtils";
export * from "./NotebookOperationJournal";
export * from "./NotebookRegistry";
export * from "./KaggleNotebookAdapter";
export * from "./ColabNotebookAdapter";
export * from "./PaperspaceNotebookAdapter";
export * from "./LightningNotebookAdapter";
export * from "./HuggingFaceZeroGPUAdapter";

export function createDefaultNotebookRegistry(): NotebookRegistry {
  const registry = new NotebookRegistry();
  registry.register(new KaggleNotebookAdapter());
  registry.register(new ColabNotebookAdapter());
  registry.register(new PaperspaceNotebookAdapter());
  registry.register(new LightningNotebookAdapter());
  registry.register(new HuggingFaceZeroGPUAdapter());
  return registry;
}
