import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";

function getEncryptionKey(): Buffer {
  const configured =
    process.env.CREDENTIAL_ENCRYPTION_KEY ||
    (process.env.NODE_ENV !== "production"
      ? process.env.INTERNAL_API_SECRET_KEY
      : undefined);

  if (!configured) {
    throw new Error(
      "COMPUTE_CONNECTION_ENCRYPTION_KEY_MISSING: configure CREDENTIAL_ENCRYPTION_KEY before storing provider secrets.",
    );
  }

  return crypto.createHash("sha256").update(configured, "utf8").digest();
}

export interface EncryptedSecretBundle {
  version: 1;
  iv: string;
  authTag: string;
  ciphertext: string;
}

export function encryptConnectionSecrets(
  secrets: Record<string, string>,
): EncryptedSecretBundle {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  const plaintext = JSON.stringify(secrets);
  const ciphertext = cipher.update(plaintext, "utf8", "base64") + cipher.final("base64");
  return {
    version: 1,
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    ciphertext,
  };
}

export function decryptConnectionSecrets(
  payload: EncryptedSecretBundle,
): Record<string, string> {
  if (payload.version !== 1) {
    throw new Error("COMPUTE_CONNECTION_SECRET_VERSION_UNSUPPORTED");
  }

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    getEncryptionKey(),
    Buffer.from(payload.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(payload.authTag, "base64"));
  const plaintext =
    decipher.update(payload.ciphertext, "base64", "utf8") +
    decipher.final("utf8");
  const parsed = JSON.parse(plaintext) as Record<string, unknown>;

  if (!parsed || typeof parsed !== "object") {
    throw new Error("COMPUTE_CONNECTION_SECRET_PAYLOAD_INVALID");
  }

  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value !== "string") {
      throw new Error("COMPUTE_CONNECTION_SECRET_VALUE_INVALID:" + key);
    }
    result[key] = value;
  }
  return result;
}

export function maskConnectionSecret(value: string): string {
  if (!value || value.length < 8) return "••••••••";
  return value.slice(0, 3) + "••••" + value.slice(-3);
}