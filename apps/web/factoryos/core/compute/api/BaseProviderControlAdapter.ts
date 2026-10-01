import { createHash } from "node:crypto";
import type {
  ApiProviderType,
  ProviderApiMetadata,
  ProvisionRequest,
  ProviderResource,
  ResourceReference,
} from "./ProviderApiContracts";
import { ProviderApiTransport } from "./ProviderApiTransport";

export abstract class BaseProviderControlAdapter {
  abstract readonly metadata: ProviderApiMetadata;

  protected readonly transport: ProviderApiTransport;

  protected constructor(
    baseUrl: string,
    token?: string,
    timeoutMs = 15000,
  ) {
    this.transport = new ProviderApiTransport(baseUrl, token, timeoutMs);
  }

  protected hashRequest(value: unknown): string {
    const canonical = JSON.stringify(value, Object.keys(value as any).sort());
    return createHash("sha256").update(canonical).digest("hex");
  }

  protected deterministicName(prefix: string, request: ProvisionRequest): string {
    return `${prefix}-${request.idempotencyKey.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32)}`;
  }

  protected ref(
    providerType: ApiProviderType,
    resourceId: string,
    idempotencyKey?: string,
    operationId?: string,
  ): ResourceReference {
    return {
      providerId: this.metadata.providerId,
      providerType,
      resourceId,
      idempotencyKey,
      operationId,
    };
  }

  protected unknownResource(
    providerType: ApiProviderType,
    resourceId: string,
    metadata: Record<string, unknown> = {},
  ): ProviderResource {
    return {
      reference: this.ref(providerType, resourceId),
      state: "UNKNOWN",
      updatedAt: new Date().toISOString(),
      providerMetadata: metadata,
    };
  }

  protected boolEnv(name: string, defaultValue = false): boolean {
    const value = process.env[name];
    if (value === undefined) return defaultValue;
    return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
  }

  protected csvEnv(name: string): string[] {
    return (process.env[name] || "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
  }
}
