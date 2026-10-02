export * from "./SandboxContracts";
export * from "./DaytonaSandboxAdapter";
export * from "./ModalSandboxAdapter";
export * from "./SandboxRegistry";

import { DaytonaSandboxAdapter } from "./DaytonaSandboxAdapter";
import { ModalSandboxAdapter } from "./ModalSandboxAdapter";
import { sandboxRegistry } from "./SandboxRegistry";

if (!sandboxRegistry.get("DAYTONA")) {
  sandboxRegistry.register(new DaytonaSandboxAdapter());
}
if (!sandboxRegistry.get("MODAL")) {
  sandboxRegistry.register(new ModalSandboxAdapter());
}
