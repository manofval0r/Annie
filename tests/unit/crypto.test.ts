import { describe, it, expect } from "vitest";
import { encryptSecret, decryptSecret } from "../../src/core/crypto.js";

describe("AES-256-GCM Token Vault Crypto", () => {
  const testKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  it("encrypts and decrypts a secret round-trip", () => {
    const plain = "ya29.a0AfH6SMC_fake_google_oauth_token";
    const cipher = encryptSecret(plain, testKey);
    expect(cipher).not.toContain(plain);
    expect(decryptSecret(cipher, testKey)).toBe(plain);
  });

  it("produces different ciphertexts for the same plaintext (random IV)", () => {
    const plain = "same-token";
    const c1 = encryptSecret(plain, testKey);
    const c2 = encryptSecret(plain, testKey);
    expect(c1).not.toBe(c2);
  });

  it("throws on tampered ciphertext, truncated GCM tag, or wrong key", () => {
    const cipher = encryptSecret("secret-123", testKey);
    const tampered = cipher.slice(0, -4) + "ffff";
    expect(() => decryptSecret(tampered, testKey)).toThrow();
    const [ivHex, tagHex, cipherHex] = cipher.split(":");
    expect(() => decryptSecret(`${ivHex}:${tagHex.slice(0, 8)}:${cipherHex}`, testKey)).toThrow();
    const wrongKey = "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
    expect(() => decryptSecret(cipher, wrongKey)).toThrow();
  });
});
