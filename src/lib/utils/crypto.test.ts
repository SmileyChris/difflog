import { describe, test, expect } from "bun:test";
import {
  encryptApiKeys,
  decryptApiKeys,
  encryptApiKeysWithSalt,
  encryptData,
  decryptData,
  uint8ToBase64,
  base64ToUint8,
  decryptApiKey,
} from "./crypto";

describe("crypto.ts", () => {
  const password = "test-password-123";

  describe("API keys encrypt/decrypt round-trip", () => {
    test("encrypts and decrypts multiple keys back to original", async () => {
      const apiKeys = {
        anthropic: "sk-ant-api03-fake-key-1234567890",
        serper: "serper-key-xyz",
        deepseek: "deepseek-key-abc",
        gemini: "gemini-key-def",
        perplexity: "perplexity-key-ghi"
      };
      const { encrypted, salt } = await encryptApiKeys(apiKeys, password);
      const decrypted = await decryptApiKeys(encrypted, salt, password);
      expect(decrypted).toEqual(apiKeys);
    });

    test("encrypts and decrypts single key", async () => {
      const apiKeys = { anthropic: "sk-ant-api03-single-key" };
      const { encrypted, salt } = await encryptApiKeys(apiKeys, password);
      const decrypted = await decryptApiKeys(encrypted, salt, password);
      expect(decrypted).toEqual(apiKeys);
    });

    test("wrong password fails to decrypt", async () => {
      const apiKeys = { anthropic: "sk-ant-api03-fake-key" };
      const { encrypted, salt } = await encryptApiKeys(apiKeys, password);
      expect(decryptApiKeys(encrypted, salt, "wrong-password")).rejects.toThrow();
    });

    test("each encryption produces different ciphertext", async () => {
      const apiKeys = { anthropic: "sk-ant-api03-same-key" };
      const result1 = await encryptApiKeys(apiKeys, password);
      const result2 = await encryptApiKeys(apiKeys, password);
      expect(result1.encrypted).not.toBe(result2.encrypted);
    });
  });

  describe("encryptApiKeysWithSalt", () => {
    test("re-encrypts with existing salt and decrypts back", async () => {
      const apiKeys = { anthropic: "sk-ant-api03-reencrypt-test", serper: "serper-key" };
      const { salt } = await encryptApiKeys(apiKeys, password);
      const reencrypted = await encryptApiKeysWithSalt(apiKeys, password, salt);
      const decrypted = await decryptApiKeys(reencrypted, salt, password);
      expect(decrypted).toEqual(apiKeys);
    });
  });

  describe("backward compatibility with old single-key format", () => {
    test("decryptApiKeys handles old single-key encrypted data", async () => {
      // Simulate old format: single string encrypted with decryptApiKey
      const oldApiKey = "sk-ant-api03-old-format";
      const salt = uint8ToBase64(crypto.getRandomValues(new Uint8Array(16)));

      // Manually encrypt as single key (old format)
      const saltBytes = new Uint8Array(16);
      crypto.getRandomValues(saltBytes);
      const saltBase64 = uint8ToBase64(saltBytes);
      const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(password),
        'PBKDF2',
        false,
        ['deriveKey']
      );
      const derivedKey = await crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: saltBytes, iterations: 100000, hash: 'SHA-256' },
        key,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt']
      );
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        derivedKey,
        new TextEncoder().encode(oldApiKey)
      );
      const combined = new Uint8Array(iv.length + encrypted.byteLength);
      combined.set(iv);
      combined.set(new Uint8Array(encrypted), iv.length);
      const encryptedBase64 = uint8ToBase64(combined);

      // decryptApiKeys should handle this and return { anthropic: key }
      const decrypted = await decryptApiKeys(encryptedBase64, saltBase64, password);
      expect(decrypted).toEqual({ anthropic: oldApiKey });
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


  describe("base64 round-trip", () => {
    test("converts Uint8Array to base64 and back", () => {
      const original = new Uint8Array([0, 1, 127, 128, 255]);
      const encoded = uint8ToBase64(original);
      const decoded = base64ToUint8(encoded);
      expect(decoded).toEqual(original);
    });
  });
});
