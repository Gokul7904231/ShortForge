import type { AdminUser } from "@/lib/auth/types";
import {
  ComputeConnectionService,
  computeConnectionService,
  listAvailableProviders as listAvailableProvidersFromService,
} from "./ComputeConnectionService";

export * from "./ComputeConnectionContracts";
export * from "./ComputeConnectionCatalog";
export * from "./ComputeConnectionCrypto";
export * from "./ComputeConnectionStore";
export * from "./KaggleOAuthService";
export * from "./NotebookConnectionService";
export * from "./SandboxConnectionService";

export { ComputeConnectionService, computeConnectionService };

export function listAvailableProviders(user: AdminUser) {
  return listAvailableProvidersFromService(user).sort((a, b) =>
    a.providerId.localeCompare(b.providerId),
  );
}