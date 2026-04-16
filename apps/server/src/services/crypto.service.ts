import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

import { env } from "../config/env";
import { AppError } from "../utils/app-error";

const VERSION = "v1";

function toBase64Url(input: Buffer) {
  return input.toString("base64url");
}

function fromBase64Url(input: string) {
  return Buffer.from(input, "base64url");
}

export function encryptSecret(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", env.masterKeyBuffer, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [VERSION, toBase64Url(iv), toBase64Url(tag), toBase64Url(ciphertext)].join(".");
}

export function decryptSecret(payload: string): string {
  const [version, ivRaw, tagRaw, cipherRaw] = payload.split(".");

  if (version !== VERSION || !ivRaw || !tagRaw || !cipherRaw) {
    throw new AppError(500, "INVALID_SECRET_PAYLOAD", "Stored secret payload is invalid.");
  }

  try {
    const decipher = createDecipheriv("aes-256-gcm", env.masterKeyBuffer, fromBase64Url(ivRaw));
    decipher.setAuthTag(fromBase64Url(tagRaw));
    const plaintext = Buffer.concat([
      decipher.update(fromBase64Url(cipherRaw)),
      decipher.final()
    ]);

    return plaintext.toString("utf8");
  } catch (error) {
    throw new AppError(500, "SECRET_DECRYPTION_FAILED", "Failed to decrypt stored secret.", {
      cause: error instanceof Error ? error.message : "unknown"
    });
  }
}

