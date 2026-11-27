import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const EPHEMERAL_DEV_KEY = randomBytes(32).toString("hex");

function resolveKey(hexKey?: string): Buffer {
  const raw = hexKey || process.env.ENCRYPTION_KEY || EPHEMERAL_DEV_KEY;
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
 */
export function decryptSecret(payload: string, hexKey?: string): string {
  const parts = payload.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted secret format");
  }
  const [ivHex, tagHex, cipherHex] = parts;
  const key = resolveKey(hexKey);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(cipherHex, "hex")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
