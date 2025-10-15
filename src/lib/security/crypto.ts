import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { getServerEnv } from "@/config/env";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12;
const AUTH_TAG_LENGTH_BYTES = 16;
const PAYLOAD_VERSION = "gma1"; // Gmail token encryption version marker

function getKey(): Buffer {
  const env = getServerEnv();
  return Buffer.from(env.TOKEN_ENCRYPTION_KEY, "base64");
}

function splitPayload(raw: string): {
  iv: Buffer;
  ciphertext: Buffer;
  authTag: Buffer;
} {
  const buffer = Buffer.from(raw, "base64");

  if (buffer.length <= IV_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES) {
    throw new Error("Invalid encrypted token payload");
  }

  const iv = buffer.subarray(0, IV_LENGTH_BYTES);
  const authTag = buffer.subarray(buffer.length - AUTH_TAG_LENGTH_BYTES);
  const ciphertext = buffer.subarray(
    IV_LENGTH_BYTES,
    buffer.length - AUTH_TAG_LENGTH_BYTES
  );

  return { iv, ciphertext, authTag };
}

export function encryptGmailToken(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final()
  ]);
  const authTag = cipher.getAuthTag();
  const payload = Buffer.concat([iv, ciphertext, authTag]).toString("base64");

  return `${PAYLOAD_VERSION}:${payload}`;
}

export function decryptGmailToken(encrypted: string): string {
  const [version, payload] = encrypted.split(":");
  if (version !== PAYLOAD_VERSION || !payload) {
    throw new Error("Unsupported encrypted token format");
  }

  const key = getKey();
  const { iv, ciphertext, authTag } = splitPayload(payload);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final()
  ]);

  return plaintext.toString("utf8");
}
