export * from "./SandboxContracts";
export * from "./DaytonaSandboxAdapter";
export * from "./ModalSandboxAdapter";
export * from "./InstaVMSandboxAdapter";
export * from "./SandboxRegistry";

import { DaytonaSandboxAdapter } from "./DaytonaSandboxAdapter";
import { ModalSandboxAdapter } from "./ModalSandboxAdapter";
import { InstaVMSandboxAdapter } from "./InstaVMSandboxAdapter";
import { sandboxRegistry } from "./SandboxRegistry";

if (!sandboxRegistry.get("DAYTONA")) {
  sandboxRegistry.register(new DaytonaSandboxAdapter());
}
if (!sandboxRegistry.get("MODAL")) {
  sandboxRegistry.register(new ModalSandboxAdapter());
}
if (!sandboxRegistry.get("INSTAVM")) {
  sandboxRegistry.register(new InstaVMSandboxAdapter());
}
