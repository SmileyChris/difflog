---
icon: lucide/lock
---

# Encryption

diff·log uses client-side encryption to protect sensitive data. The server only stores encrypted blobs.

## What's Encrypted

| Data | Encrypted | Algorithm |
|------|-----------|-----------|
| API Keys | Yes | AES-256-GCM |
| Diffs | Yes | AES-256-GCM |
| Stars | Yes | AES-256-GCM |
| Profile metadata | No | Plaintext |
| Password | Hashed | SHA-256 (transport) + PBKDF2 (server) |

### Profile Metadata (Unencrypted)

The following fields are stored in plaintext on the server:

- `name` - profile display name
- `languages` - e.g., `["JavaScript", "Python"]`
- `frameworks` - e.g., `["React", "Django"]`
- `tools` - e.g., `["Docker", "Kubernetes"]`
- `topics` - e.g., `["AI/ML", "DevOps"]`
- `depth` - reading preference (`quick`, `standard`, `deep`)
- `custom_focus` - optional custom focus text

This is intentional: profile preferences are low-sensitivity data (similar to a public GitHub profile) and need to be readable for the share page preview. Anyone with the profile ID can view these via [`GET /api/share/{id}`](api.md#get-apishareid).

## Encryption Algorithm

All encryption uses **AES-256-GCM** via the Web Crypto API:

- **Key derivation**: PBKDF2 with 100,000 iterations
- **Key length**: 256 bits
- **IV**: Random 12 bytes per encryption
- **Authentication**: Built into GCM mode

## Key Derivation

The encryption key is derived from the user's password:

```typescript
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
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
```

!!! note "Salt Reuse"
    The same salt is used for all content encryption within a profile. This is safe because each encryption uses a unique random IV.

## Encrypting Data

### API Keys Encryption

When sharing a profile, all API keys are encrypted as a JSON object:

```typescript
async function encryptApiKeys(apiKeys: Record<string, string>, password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltBase64 = uint8ToBase64(salt);

  // Encrypt the entire apiKeys object as JSON
  const encrypted = await encryptData(apiKeys, password, saltBase64);

  return {
    encrypted,
    salt: saltBase64
  };
}
```

**Supported Keys:**
- `anthropic` - Anthropic API key
- `serper` - Serper API key (web search)
- `perplexity` - Perplexity API key (web search + synthesis)
- `deepseek` - DeepSeek API key (curation + synthesis)
- `gemini` - Google Gemini API key (curation + synthesis)

All keys are encrypted together and stored as a single encrypted blob on the server. When importing a profile on another device, all keys are restored.

### Content Encryption

Diffs and stars are encrypted as JSON:

```typescript
async function encryptData(data: any, password: string, salt: string) {
  const saltBytes = base64ToUint8(salt);
  const key = await deriveKey(password, saltBytes);
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(JSON.stringify(data))
  );

  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);

  return base64(combined);
}
```

## Decrypting Data

```typescript
async function decryptData<T>(encrypted: string, password: string, salt: string): Promise<T> {
  const saltBytes = base64ToUint8(salt);
  const combined = base64ToUint8(encrypted);

  // Extract IV from first 12 bytes
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
```

## Password Hashing

Password hashing uses two layers for authentication (not encryption):

### Transport Hash (Client-Side)

The client hashes the password with SHA-256 before sending it over the wire:

```typescript
async function hashPasswordForTransport(password: string, salt?: string) {
  const saltValue = salt || base64(crypto.getRandomValues(new Uint8Array(16)));
  const data = encoder.encode(saltValue + password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return saltValue + ':' + base64(new Uint8Array(hashBuffer));
}
```

Transport hash format: `{clientSalt}:{base64(SHA-256)}`

Example: `zi7g35hMWZ4GjQlu32aFQg==:T1j5DDOgm4xOh+l9WBl8bpcHrkpJaTtdC+FGPWpymD4=`

### Server-Side Hash (Stored in DB)

The server applies PBKDF2 (100,000 iterations, SHA-256) to the transport hash before storing:

```typescript
async function hashPasswordServer(transportHash: string): Promise<string> {
  const serverSalt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    'raw', encoder.encode(transportHash), 'PBKDF2', false, ['deriveBits']
  );
  const derivedBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: serverSalt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial, 256
  );
  return `v2:${base64(serverSalt)}:${base64(derivedBits)}`;
}
```

Stored hash format: `v2:{base64(serverSalt)}:{base64(derivedKey)}`

The `v2:` prefix distinguishes server-hashed passwords from legacy v1 hashes (plain transport hashes). Legacy hashes are automatically upgraded to v2 on successful authentication.

### Why Two Layers?

- **Client-side SHA-256**: Prevents the raw password from being sent to the server, even over TLS
- **Server-side PBKDF2**: Ensures that a database breach doesn't expose passwords to offline cracking. Without this, the single-round SHA-256 transport hash could be cracked at billions of guesses/sec

## Content Hash

For [sync comparison](sync.md#hash-comparison), a hash is computed over all encrypted content:

```typescript
async function computeHash(items: string[]): Promise<string> {
  const combined = [...items].sort().join('|');
  const data = encoder.encode(combined);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
```

This hash is computed over encrypted data, so it can be stored on the server to detect changes without revealing content.

## Security Model

``` mermaid
graph LR
    subgraph Client
        P[Password] --> KD[Key Derivation]
        KD --> EK[Encryption Key]
        EK --> E[Encrypt]
        D[Data] --> E
        E --> ED[Encrypted Data]
    end

    subgraph Server
        ED2[Encrypted Data]
        H[Hash]
    end

    ED --> ED2
    ED --> H

    style P fill:#f96
    style EK fill:#9f9
    style ED fill:#99f
    style ED2 fill:#99f
```

!!! warning "Password Recovery"
    There is **no password recovery**. If you forget your password:

    - Your encrypted data cannot be decrypted
    - You must delete the profile and create a new one
    - Local unsynced data on other devices remains accessible

## Implementation Notes

### Browser Compatibility

Uses standard Web Crypto API, supported in all modern browsers:

- Chrome 37+
- Firefox 34+
- Safari 11+
- Edge 12+

### Performance

- Key derivation: ~100-200ms (intentionally slow for security)
- Encryption/decryption: <1ms per item
- Hash computation: <10ms for typical content

### Error Handling

Decryption failures (wrong password) throw a `DOMException`:

```typescript
try {
  await decryptData(encrypted, password, salt);
} catch (e) {
  if (e.name === 'OperationError') {
    // Wrong password or corrupted data
  }
}
```
