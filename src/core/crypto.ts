import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const EPHEMERAL_DEV_KEY = randomBytes(32).toString("hex");

function resolveKey(hexKey?: string): Buffer {
  const envKey = process.env.ENCRYPTION_KEY;
  if (!hexKey && !envKey && process.env.NODE_ENV === "production") {
    throw new Error("ENCRYPTION_KEY must be set in production");
  }
  const raw = hexKey || envKey || EPHEMERAL_DEV_KEY;
  const buf = Buffer.from(raw, "hex");
  if (buf.length !== 32) {
    throw new Error("ENCRYPTION_KEY must be a 64-character hex string (32 bytes)");
  }
  return buf;
}

/**
 * Encrypts a secret string using AES-256-GCM with a random 12-byte IV.
 * Format: ivHex:authTagHex:cipherHex
 */
export function encryptSecret(plaintext: string, hexKey?: string): string {
  const key = resolveKey(hexKey);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Decrypts an AES-256-GCM payload produced by encryptSecret.
 * Enforces 12-byte IV and 16-byte auth tag to prevent tag-truncation attacks.
 */
export function decryptSecret(payload: string, hexKey?: string): string {
  const parts = payload.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted secret format");
  }
  const [ivHex, tagHex, cipherHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  if (iv.length !== 12 || tag.length !== 16) {
    throw new Error("Invalid IV or GCM auth tag length");
  }
  const key = resolveKey(hexKey);
  const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(cipherHex, "hex")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
