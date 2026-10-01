import type { AdminUser } from "@/lib/auth/types";
import {
  listAvailableProviders as listAvailableProvidersFromService,
  ComputeConnectionService,
  computeConnectionService,
} from "./connections/ComputeConnectionService";

export * from "./connections/ComputeConnectionContracts";
export * from "./connections/ComputeConnectionCatalog";
export * from "./connections/ComputeConnectionCrypto";
export * from "./connections/ComputeConnectionStore";
export * from "./connections/NotebookConnectionService";

export { ComputeConnectionService, computeConnectionService };

export function listAvailableProviders(user: AdminUser) {
  return listAvailableProvidersFromService(user).sort((a, b) =>
    a.providerId.localeCompare(b.providerId),
  );
}
