import { describe, test, expect } from "bun:test";
import {
  encryptApiKey,
  decryptApiKey,
  encryptApiKeyWithSalt,
  encryptData,
  decryptData,
  verifyPassword,
  uint8ToBase64,
  base64ToUint8,
} from "./crypto";

describe("crypto.ts", () => {
  const password = "test-password-123";

  describe("API key encrypt/decrypt round-trip", () => {
    test("encrypts and decrypts back to original", async () => {
      const apiKey = "sk-ant-api03-fake-key-1234567890";
      const { encrypted, salt } = await encryptApiKey(apiKey, password);
      const decrypted = await decryptApiKey(encrypted, salt, password);
      expect(decrypted).toBe(apiKey);
    });

    test("wrong password fails to decrypt", async () => {
      const apiKey = "sk-ant-api03-fake-key";
      const { encrypted, salt } = await encryptApiKey(apiKey, password);
      expect(decryptApiKey(encrypted, salt, "wrong-password")).rejects.toThrow();
    });

    test("each encryption produces different ciphertext", async () => {
      const apiKey = "sk-ant-api03-same-key";
      const result1 = await encryptApiKey(apiKey, password);
      const result2 = await encryptApiKey(apiKey, password);
      expect(result1.encrypted).not.toBe(result2.encrypted);
    });
  });

  describe("encryptApiKeyWithSalt", () => {
    test("re-encrypts with existing salt and decrypts back", async () => {
      const apiKey = "sk-ant-api03-reencrypt-test";
      const { salt } = await encryptApiKey(apiKey, password);
      const reencrypted = await encryptApiKeyWithSalt(apiKey, password, salt);
      const decrypted = await decryptApiKey(reencrypted, salt, password);
      expect(decrypted).toBe(apiKey);
    });
  });

  describe("data encrypt/decrypt round-trip", () => {
    const salt = uint8ToBase64(new Uint8Array(16).fill(1));

    test("round-trips a plain object", async () => {
      const data = { name: "test", items: [1, 2, 3] };
      const encrypted = await encryptData(data, password, salt);
      const decrypted = await decryptData(encrypted, password, salt);
      expect(decrypted).toEqual(data);
    });

    test("round-trips an array", async () => {
      const data = [{ id: "a", text: "hello" }, { id: "b", text: "world" }];
      const encrypted = await encryptData(data, password, salt);
      const decrypted = await decryptData(encrypted, password, salt);
      expect(decrypted).toEqual(data);
    });

    test("wrong password fails to decrypt data", async () => {
      const data = { secret: true };
      const encrypted = await encryptData(data, password, salt);
      expect(decryptData(encrypted, "wrong-password", salt)).rejects.toThrow();
    });

    test("wrong salt fails to decrypt data", async () => {
      const salt2 = uint8ToBase64(new Uint8Array(16).fill(2));
      const data = { id: "diff-1", content: "test diff" };
      const encrypted = await encryptData(data, password, salt);
      expect(decryptData(encrypted, password, salt2)).rejects.toThrow();
    });

    test("data encrypted with salt1 cannot be decrypted with salt2", async () => {
      // Regression: simulates multi-device salt drift after password change
      const salt1 = uint8ToBase64(new Uint8Array(16).fill(10));
      const salt2 = uint8ToBase64(new Uint8Array(16).fill(20));
      const diff = { id: "d1", content: "# Dev News", generated_at: "2025-01-01" };

      const encrypted = await encryptData(diff, password, salt1);

      // Same password but different salt → OperationError
      expect(decryptData(encrypted, password, salt2)).rejects.toThrow();

      // Original salt still works
      const decrypted = await decryptData(encrypted, password, salt1);
      expect(decrypted).toEqual(diff);
    });
  });

  describe("verifyPassword", () => {
    test("returns true for correct password", async () => {
      const { encrypted, salt } = await encryptApiKey("test-key", password);
      expect(await verifyPassword(encrypted, salt, password)).toBe(true);
    });

    test("returns false for wrong password", async () => {
      const { encrypted, salt } = await encryptApiKey("test-key", password);
      expect(await verifyPassword(encrypted, salt, "wrong")).toBe(false);
    });
  });

  describe("base64 round-trip", () => {
    test("converts Uint8Array to base64 and back", () => {
      const original = new Uint8Array([0, 1, 127, 128, 255]);
      const encoded = uint8ToBase64(original);
      const decoded = base64ToUint8(encoded);
      expect(decoded).toEqual(original);
    });
  });
});
