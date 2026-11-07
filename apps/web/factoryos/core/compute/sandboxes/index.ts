export * from "./SandboxContracts";
export * from "./DaytonaSandboxAdapter";
export * from "./InstaVMSandboxAdapter";
export * from "./GitHubCodespacesAdapter";
export * from "./CodeSandboxAdapter";
export * from "./SandboxRegistry";

import { DaytonaSandboxAdapter } from "./DaytonaSandboxAdapter";
import { InstaVMSandboxAdapter } from "./InstaVMSandboxAdapter";
import { GitHubCodespacesAdapter } from "./GitHubCodespacesAdapter";
import { CodeSandboxAdapter } from "./CodeSandboxAdapter";
import { sandboxRegistry } from "./SandboxRegistry";

if (!sandboxRegistry.get("DAYTONA")) {
  sandboxRegistry.register(new DaytonaSandboxAdapter());
}
if (!sandboxRegistry.get("INSTAVM")) {
  sandboxRegistry.register(new InstaVMSandboxAdapter());
}
if (!sandboxRegistry.get("GITHUB_CODESAPCES")) {
  sandboxRegistry.register(new GitHubCodespacesAdapter());
}
if (!sandboxRegistry.get("CODESANDBOX")) {
  sandboxRegistry.register(new CodeSandboxAdapter());
}
