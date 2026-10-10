export * from "./SandboxContracts";
export * from "./DaytonaSandboxAdapter";
export * from "./ModalSandboxAdapter";
export * from "./InstaVMSandboxAdapter";
export * from "./OpenComputerSandboxAdapter";
export * from "./BlaxelSandboxAdapter";
export * from "./SandboxRegistry";

import { DaytonaSandboxAdapter } from "./DaytonaSandboxAdapter";
import { ModalSandboxAdapter } from "./ModalSandboxAdapter";
import { InstaVMSandboxAdapter } from "./InstaVMSandboxAdapter";
import { OpenComputerSandboxAdapter } from "./OpenComputerSandboxAdapter";
import { BlaxelSandboxAdapter } from "./BlaxelSandboxAdapter";
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
if (!sandboxRegistry.get("OPENCOMPUTER")) {
  sandboxRegistry.register(new OpenComputerSandboxAdapter());
}
if (!sandboxRegistry.get("BLAXEL")) {
  sandboxRegistry.register(new BlaxelSandboxAdapter());
}
