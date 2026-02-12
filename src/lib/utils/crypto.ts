/**
 * Client-side encryption utilities for API key protection
 * Uses Web Crypto API (available in all modern browsers)
 */

/**
 * Derive an AES-256-GCM encryption key from a password using PBKDF2
 */
export async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt all API keys (as JSON object) using a password-derived key
 * Returns base64-encoded encrypted data and salt
 */
export async function encryptApiKeys(
  apiKeys: Record<string, string>,
  password: string
): Promise<{ encrypted: string; salt: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltBase64 = uint8ToBase64(salt);
  const encrypted = await encryptData(apiKeys, password, saltBase64);
  return {
    encrypted,
    salt: saltBase64
  };
}

/**
 * Encrypt all API keys (as JSON object) using a password-derived key with an existing salt
 * Used for re-encryption during password changes
 */
export async function encryptApiKeysWithSalt(
  apiKeys: Record<string, string>,
  password: string,
  salt: string
): Promise<string> {
  return encryptData(apiKeys, password, salt);
}

/**
 * Decrypt an API key using a password-derived key
 */
export async function decryptApiKey(
  encrypted: string,
  salt: string,
  password: string
): Promise<string> {
  const saltBytes = base64ToUint8(salt);
  const combined = base64ToUint8(encrypted);

  const iv = combined.slice(0, 12);
  const data = combined.slice(12);

  const key = await deriveKey(password, saltBytes);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );

  return new TextDecoder().decode(decrypted);
}

/**
 * Decrypt all API keys (from JSON object) using a password-derived key
 * Handles both old format (single string) and new format (JSON object)
 */
export async function decryptApiKeys(
  encrypted: string,
  salt: string,
  password: string
): Promise<Record<string, string>> {
  try {
    // Try to decrypt as JSON object (new format)
    const apiKeys = await decryptData<Record<string, string>>(encrypted, password, salt);
    return apiKeys;
  } catch {
    // Fallback to old format (single Anthropic key as string)
    try {
      const anthropicKey = await decryptApiKey(encrypted, salt, password);
      return { anthropic: anthropicKey };
    } catch (e) {
      throw new Error('Failed to decrypt API keys');
    }
  }
}

/**
 * Hash a password for server-side verification
 * Uses SHA-256 + salt (bcrypt is done server-side for actual storage)
 */
export async function hashPasswordForTransport(password: string, salt?: string): Promise<string> {
  const encoder = new TextEncoder();
  const saltValue = salt || uint8ToBase64(crypto.getRandomValues(new Uint8Array(16)));
  const data = encoder.encode(saltValue + password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return saltValue + ':' + uint8ToBase64(new Uint8Array(hashBuffer));
}

/**
 * Generate a random UUID
 */
export function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Convert Uint8Array to base64 string
 */
export function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert base64 string to Uint8Array
 */
export function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Verify that a password can decrypt the stored API key
 * Returns true if decryption succeeds
 */
export async function verifyPassword(
  encrypted: string,
  salt: string,
  password: string
): Promise<boolean> {
  try {
    await decryptApiKey(encrypted, salt, password);
    return true;
  } catch {
    return false;
  }
}

/**
 * Encrypt arbitrary data (JSON-serializable) using a password and existing salt
 * Used for encrypting diffs and stars for sync
 */
export async function encryptData(data: unknown, password: string, salt: string): Promise<string> {
  const saltBytes = base64ToUint8(salt);
  const key = await deriveKey(password, saltBytes);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(JSON.stringify(data))
  );

  // Prepend IV to encrypted data
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);

  return uint8ToBase64(combined);
}

/**
 * Decrypt data that was encrypted with encryptData
 * Returns the original JSON-parsed data
 */
export async function decryptData<T = any>(encrypted: string, password: string, salt: string): Promise<T> {
  const saltBytes = base64ToUint8(salt);
  const combined = base64ToUint8(encrypted);

  const iv = combined.slice(0, 12);
  const data = combined.slice(12);

  const key = await deriveKey(password, saltBytes);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );

  return JSON.parse(new TextDecoder().decode(decrypted));
}

/**
 * Compute a hash from an array of encrypted data strings
 * Used for sync comparison
 * @deprecated Use computeContentHash for deterministic hashing
 */
export async function computeHash(items: string[]): Promise<string> {
  const combined = [...items].sort().join('|');
  const encoder = new TextEncoder();
  const data = encoder.encode(combined);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Compute a deterministic hash from plaintext content
 * Sorts items by ID and keys for consistent hashing across encryptions
 */
export async function computeContentHash(items: Array<{ id: string; [key: string]: unknown }>): Promise<string> {
  // Sort by ID for deterministic ordering
  const sorted = [...items].sort((a, b) => a.id.localeCompare(b.id));
  // Stringify each item deterministically (keys sorted)
  const serialized = sorted.map(item => JSON.stringify(item, Object.keys(item).sort()));
  const combined = serialized.join('|');
  const data = new TextEncoder().encode(combined);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return uint8ToBase64(new Uint8Array(hashBuffer));
}
