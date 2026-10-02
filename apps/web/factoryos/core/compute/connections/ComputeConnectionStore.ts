import { randomUUID } from "node:crypto";
import { db } from "@/lib/firebase-admin";
import {
  decryptConnectionSecrets,
  encryptConnectionSecrets,
  maskConnectionSecret,
  type EncryptedSecretBundle,
} from "./ComputeConnectionCrypto";
import type {
  ComputeConnection,
  ComputeConnectionSecretBundle,
  ConnectionCreateInput,
  PublicComputeConnection,
} from "./ComputeConnectionContracts";

interface StoredComputeConnection extends ComputeConnection {
  encryptedSecrets: EncryptedSecretBundle;
}

function collection() {
  return db.collection("computeConnections");
}

function toPublic(record: ComputeConnection | StoredComputeConnection): PublicComputeConnection {
  const { userId: _userId, encryptedSecrets: _encryptedSecrets, ...publicRecord } = record as StoredComputeConnection;
  return {
    ...publicRecord,
    secretKeys: Object.keys(record.maskedSecrets),
  };
}

export class ComputeConnectionStore {
  async listForUser(userId: string): Promise<PublicComputeConnection[]> {
    const snapshot = await collection().where("userId", "==", userId).get();
    return snapshot.docs
      .map((doc: any) => toPublic(doc.data() as ComputeConnection))
      .sort((a, b) => a.providerId.localeCompare(b.providerId));
  }

  async create(
    userId: string,
    input: ConnectionCreateInput,
  ): Promise<PublicComputeConnection> {
    if (!input.credentials || Object.keys(input.credentials).length === 0) {
      throw new Error("COMPUTE_CONNECTION_CREDENTIALS_EMPTY");
    }

    const connectionId = randomUUID();
    const now = new Date().toISOString();
    const encryptedSecrets = encryptConnectionSecrets(input.credentials);

    const maskedSecrets = Object.fromEntries(
      Object.entries(input.credentials).map(([key, value]) => [
        key,
        maskConnectionSecret(value),
      ]),
    );

    const record: StoredComputeConnection = {
      connectionId,
      userId,
      providerId: input.providerId,
      providerFamily: input.providerFamily || "NOTEBOOK",
      displayName: input.displayName || input.providerId,
      authMethod: input.authMethod || "CREDENTIAL_BUNDLE",
      status: "UNVERIFIED",
      externalAccountId: input.externalAccountId,
      maskedSecrets,
      metadata: input.metadata || {},
      createdAt: now,
      updatedAt: now,
      encryptedSecrets,
    };

    await collection().doc(connectionId).set(record);
    return toPublic(record);
  }

  async getForUser(
    userId: string,
    connectionId: string,
  ): Promise<PublicComputeConnection | null> {
    const doc = await collection().doc(connectionId).get();
    if (!doc.exists) return null;
    const record = doc.data() as ComputeConnection;
    if (record.userId !== userId) return null;
    return toPublic(record);
  }

  async getSecretsForUser(
    userId: string,
    connectionId: string,
  ): Promise<ComputeConnectionSecretBundle | null> {
    const doc = await collection().doc(connectionId).get();
    if (!doc.exists) return null;
    const record = doc.data() as StoredComputeConnection;
    if (record.userId !== userId) return null;
    return decryptConnectionSecrets(record.encryptedSecrets);
  }

  async updateValidation(
    userId: string,
    connectionId: string,
    patch: Pick<ComputeConnection, "status" | "lastValidatedAt" | "lastValidationEvidence">,
  ): Promise<PublicComputeConnection | null> {
    const doc = await collection().doc(connectionId).get();
    if (!doc.exists) return null;
    const record = doc.data() as StoredComputeConnection;
    if (record.userId !== userId) return null;

    const next = {
      ...record,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    await collection().doc(connectionId).set(next);
    return toPublic(next);
  }

  async deleteForUser(userId: string, connectionId: string): Promise<boolean> {
    const doc = await collection().doc(connectionId).get();
    if (!doc.exists) return false;
    const record = doc.data() as ComputeConnection;
    if (record.userId !== userId) return false;
    await collection().doc(connectionId).delete();
    return true;
  }
}

export const computeConnectionStore = new ComputeConnectionStore();