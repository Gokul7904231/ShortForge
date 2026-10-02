import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/firebase-admin";
import {
  computeConnectionService,
  computeConnectionStore,
  getComputeProviderDefinition,
  listAvailableProviders,
  validateSandboxConnection,
} from "@/factoryos/core/compute/connections";
import type { AdminUser } from "@/lib/auth/types";

process.env.CREDENTIAL_ENCRYPTION_KEY =
  process.env.CREDENTIAL_ENCRYPTION_KEY || "shortforge-test-connection-key";

const basicUser: AdminUser = {
  uid: "connection-test-basic",
  email: "basic@example.com",
  name: "Basic",
  role: "USER",
  active: true,
  disabled: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const adminUser: AdminUser = {
  ...basicUser,
  uid: "connection-test-admin",
  email: "admin@example.com",
  role: "ADMIN",
};

describe("compute connection hub", () => {
  beforeEach(() => {
    const store = (globalThis as any).__mock_firestore;
    if (store?.computeConnections) store.computeConnections.clear();
  });

  it("exposes only notebook providers to basic users", () => {
    const providers = listAvailableProviders(basicUser);
    expect(providers.every((p) => p.providerFamily === "NOTEBOOK")).toBe(true);
    expect(providers.map((p) => p.providerId)).toEqual([
      "notebook_colab",
      "notebook_hf_zerogpu",
      "notebook_kaggle",
      "notebook_lightning",
      "notebook_paperspace",
    ]);
  });

  it("does not let a basic user attach an admin-only provider", async () => {
    await expect(
      computeConnectionService.create(basicUser, {
        providerId: "api_vast",
        credentials: { VAST_API_KEY: "secret-value" },
      }),
    ).rejects.toThrow("COMPUTE_PROVIDER_FORBIDDEN:api_vast");
  });

  it("rejects providers that are catalogued but not implemented", async () => {
    expect(getComputeProviderDefinition("api_vast")?.implemented).toBe(false);
    await expect(
      computeConnectionService.create(adminUser, {
        providerId: "api_vast",
        credentials: { VAST_API_KEY: "secret-value" },
      }),
    ).rejects.toThrow("COMPUTE_PROVIDER_NOT_IMPLEMENTED:api_vast");
  });

  it("exposes the implemented PandaStack sandbox only to admins", () => {
    const basicProviders = listAvailableProviders(basicUser);
    const adminProviders = listAvailableProviders(adminUser);
    expect(basicProviders.some((p) => p.providerId === "sandbox_pandastack_hosted")).toBe(false);
    expect(adminProviders.some((p) => p.providerId === "sandbox_pandastack_hosted" && p.providerFamily === "SANDBOX" && p.implemented === true)).toBe(true);
  });

  it("verifies an admin PandaStack sandbox connection without exposing its secret", async () => {
    const connection = await computeConnectionService.create(adminUser, {
      providerId: "sandbox_pandastack_hosted",
      credentials: { PANDASTACK_API_KEY: "pds_test_secret" },
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "account-1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await validateSandboxConnection(adminUser.uid, connection.connectionId);
    expect(result.authenticated).toBe(true);
    expect(result.providerType).toBe("PANDASTACK");
    expect((await computeConnectionStore.getForUser(adminUser.uid, connection.connectionId))?.status).toBe("CONNECTED");
  });

  it("stores secrets encrypted and never returns ciphertext in public metadata", async () => {
    const connection = await computeConnectionService.create(basicUser, {
      providerId: "notebook_kaggle",
      credentials: {
        KAGGLE_USERNAME: "gokul",
        KAGGLE_KEY: "KGAT_example_secret_value",
      },
    });
    expect(connection.secretKeys).toEqual(["KAGGLE_USERNAME", "KAGGLE_KEY"]);
    expect((connection as any).encryptedSecrets).toBeUndefined();
    const raw = await db.collection("computeConnections").doc(connection.connectionId).get();
    expect(raw.exists).toBe(true);
    expect(raw.data().encryptedSecrets).toBeDefined();
    const secrets = await computeConnectionStore.getSecretsForUser(basicUser.uid, connection.connectionId);
    expect(secrets).toEqual({ KAGGLE_USERNAME: "gokul", KAGGLE_KEY: "KGAT_example_secret_value" });
  });

  it("enforces tenant isolation on both public records and secret access", async () => {
    const connection = await computeConnectionService.create(basicUser, {
      providerId: "notebook_kaggle",
      credentials: {
        KAGGLE_USERNAME: "gokul",
        KAGGLE_KEY: "KGAT_example_secret_value",
      },
    });
    expect(await computeConnectionStore.getForUser(adminUser.uid, connection.connectionId)).toBeNull();
    expect(await computeConnectionStore.getSecretsForUser(adminUser.uid, connection.connectionId)).toBeNull();
  });
});