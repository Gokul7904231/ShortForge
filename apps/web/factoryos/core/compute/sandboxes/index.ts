export * from "./SandboxContracts";
export * from "./SandboxHttpClient";
export * from "./PandaStackSandboxAdapter";
export * from "./SandboxRegistry";

import { PandaStackSandboxAdapter } from "./PandaStackSandboxAdapter";
import { sandboxRegistry } from "./SandboxRegistry";

if (!sandboxRegistry.get("PANDASTACK")) {
  sandboxRegistry.register(new PandaStackSandboxAdapter());
}