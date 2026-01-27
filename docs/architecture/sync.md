---
icon: lucide/refresh-cw
---

# Sync System

The sync system enables cross-device synchronization of profiles, diffs, and stars while maintaining [end-to-end encryption](encryption.md). See [API Endpoints](api.md) for request/response details.

## Overview

Sync is **optional** - the app works fully offline. When enabled, sync provides:

- Share profiles across devices using a password
- Sync diffs and starred items automatically
- Conflict resolution via "last write wins" with full content upload

## Key Concepts

### Two Types of Salt

The system uses two different salts:

| Salt | Purpose | Stored |
|------|---------|--------|
| **Password Salt** | Hashing password for authentication | In `password_hash` field (format: `salt:hash`) |
| **Encryption Salt** | AES-GCM encryption of content | In `salt` field |

!!! warning "Important"
    These are different values. The password salt is for auth verification, the encryption salt is for encrypting API keys and content.

### Password Hashing

Passwords are hashed client-side before transmission:

```typescript
async function hashPasswordForTransport(password: string, salt?: string): Promise<string> {
  const saltValue = salt || generateRandomSalt(); // (1)!
  const data = encoder.encode(saltValue + password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return saltValue + ':' + base64(hashBuffer);
}
```

1. If no salt provided, generates random 16-byte salt. For auth verification, **must** use the existing salt from the server.

## Sync Flow

### Initial Share (Primary Device)

``` mermaid
sequenceDiagram
    participant C as Client
    participant S as Server
    participant DB as D1 Database

    C->>C: Generate password hash (new salt)
    C->>C: Encrypt API key with AES-GCM
    C->>S: POST /api/profile/create
    S->>DB: Insert profile
    S-->>C: Success + profile ID
    C->>C: Store passwordSalt locally
    C->>C: Mark all diffs/stars as modified
    C->>S: POST /api/profile/{id}/sync
    Note over C,S: Upload all encrypted content
    S->>DB: Insert diffs and stars
    S-->>C: Success + hashes
```

### Import (Secondary Device)

``` mermaid
sequenceDiagram
    participant C as Client
    participant S as Server
    participant DB as D1 Database

    C->>S: GET /api/share/{id}
    S-->>C: Profile metadata + password_salt
    C->>C: Hash password with server's salt
    C->>S: GET /api/profile/{id}?password_hash=...
    S->>DB: Verify password hash
    S-->>C: Encrypted profile data
    C->>C: Decrypt API key
    C->>C: Store profile + passwordSalt
    C->>S: POST /api/profile/{id}/content
    S-->>C: Encrypted diffs and stars
    C->>C: Decrypt and merge content
```

### Ongoing Sync

``` mermaid
sequenceDiagram
    participant C as Client
    participant S as Server

    Note over C: On page load or change
    C->>S: GET /api/profile/{id}/status
    S-->>C: diffs_hash, stars_hash
    C->>C: Compare with local hashes

    alt Hashes differ & password cached
        C->>S: POST /api/profile/{id}/content
        S-->>C: Server content
        C->>C: Download: merge server → local
        C->>S: POST /api/profile/{id}/sync
        Note over C,S: Upload: ALL local content
        S-->>C: Updated hashes
    end
```

## Change Tracking

Changes are tracked in `pendingSync` (persisted to localStorage):

```typescript
interface PendingSync {
  modifiedDiffs: string[];    // IDs of new/changed diffs
  modifiedStars: string[];    // IDs of new/changed stars
  deletedDiffs: string[];     // IDs of deleted diffs
  deletedStars: string[];     // IDs of deleted stars
  profileModified: boolean;   // Profile metadata changed
}
```

### Auto-Sync

When the password is cached (in sessionStorage), sync triggers automatically:

| Trigger | Behavior |
|---------|----------|
| **Local change** | Sync after 2 second debounce |
| **Tab refocus** | Sync if last sync was over 1 hour ago |
| **Page load** | Sync if hashes differ from server |

```typescript
_scheduleAutoSync() {
  if (this._autoSyncTimeout) clearTimeout(this._autoSyncTimeout);
  this._autoSyncTimeout = setTimeout(() => this.autoSync(), 2000);
}

_syncIfStale() {
  const lastSync = new Date(this.profile.syncedAt).getTime();
  const oneHour = 60 * 60 * 1000;
  if (Date.now() - lastSync > oneHour) {
    this.autoSync();
  }
}

async autoSync() {
  // Clear any pending scheduled sync
  if (this._autoSyncTimeout) clearTimeout(this._autoSyncTimeout);
  // Download first (merges server content into local)
  await this.downloadContent(password);
  // Then upload (sends all local content + deletions)
  if (this.hasPendingChanges()) {
    await this.uploadContent(password);
  }
}
```

!!! important "Deletion Preservation"
    The download phase preserves `deletedDiffs` and `deletedStars` so they're available when upload runs. Without this, deletions would be lost between download and upload.

### Password Validation During Auto-Sync

If auto-sync fails with a 401 "Invalid password" error (e.g., password was changed on another device), the cached password is automatically cleared:

- Session storage password is cleared
- Any remembered password for this profile is cleared
- The sync state changes to "pending" (shows diamond icon)
- User is prompted to enter the correct password

This prevents the app from repeatedly retrying with an invalid password and triggering rate limits.

## Upload Logic

Upload is **skipped entirely** if there are no pending changes:

```typescript
if (!this.hasPendingChanges()) {
  return { uploaded: 0 };
}
```

When uploading, the client sends **ALL local content** to ensure nothing is missed:

```typescript
// Upload ALL local diffs (server does INSERT OR REPLACE)
for (const diff of this.history) {
  const encrypted = await encryptData(diff, password, salt);
  diffsToUpload.push({ id: diff.id, encrypted_data: encrypted });
}
```

This is intentionally not optimized - reliability over efficiency. The server uses `INSERT OR REPLACE` so duplicates are idempotent.

### Deletions

Deleted items are tracked separately and sent to the server:

```typescript
body: JSON.stringify({
  diffs: diffsToUpload,
  stars: starsToUpload,
  deleted_diff_ids: pending?.deletedDiffs || [],
  deleted_star_ids: pending?.deletedStars || [],
})
```

!!! note "Cascade Deletes"
    When a diff is deleted, all stars referencing it are automatically deleted too. This happens both for manual deletions and when regenerating a same-day diff (which replaces the previous one). The old diff is tracked as deleted so it gets removed from the server on sync.

## Download Logic

The download phase merges server content into local:

```typescript
// Add items from server that don't exist locally
for (const encryptedDiff of data.diffs) {
  const diff = await decryptData(encryptedDiff.encrypted_data, password, salt);

  // Skip if already local OR pending deletion
  if (existingIdx === -1 && !pendingDeletedDiffs.has(encryptedDiff.id)) {
    this.history = [...this.history, diff];
  }
}

// Remove local items not on server (deleted by another device)
// Keep items that are: on server, pending local deletion, or pending local upload
this.history = this.history.filter(d =>
  serverDiffIds.has(d.id) || pendingDeletedDiffs.has(d.id) || pendingModifiedDiffs.has(d.id)
);
```

### Profile Metadata Sync

Profile metadata (name, languages, frameworks, etc.) is also synced:

```typescript
// Apply server profile metadata (skip if local changes pending)
if (data.profile && !hasLocalProfileChanges) {
  this.profiles[id] = {
    ...current,
    name: data.profile.name,
    languages: data.profile.languages,
    frameworks: data.profile.frameworks,
    // ...
  };
}
```

!!! note "Conflict Resolution"
    If the local client has pending profile changes (`profileModified: true`), server profile data is skipped. The local changes will be uploaded next, overwriting the server.

### Deletion Propagation

When Client A deletes an item:

1. **Client A**: Item removed locally, ID added to `pendingDeletedDiffs`
2. **Client A syncs**:
    - Download skips re-adding (it's in pending deletions)
    - Upload sends remaining items + deletion ID
3. **Server**: Removes the item from database
4. **Client B syncs**:
    - Download sees item missing from server
    - Removes it from local storage

## Hash Comparison

Content hashes enable efficient sync status checks:

```typescript
// Compute hash over all encrypted content
const allDiffsEncrypted = await Promise.all(
  this.history.map(d => encryptData(d, password, salt))
);
const diffsHash = await computeHash(allDiffsEncrypted);
```

The hash is computed over encrypted data, so it can be stored on the server without revealing content.

## Password Caching

The sync password is cached in `sessionStorage` for the browser session:

- Cached **only after successful sync** (not before attempting)
- Enables auto-sync without re-entering password
- **Cleared when switching profiles** (password is profile-specific)
- **Cleared on 401 "Invalid password" error** (prevents retry loops)
- Lost when browser tab closes

### Remember Password (Opt-in)

Users can opt to [remember their password](remember-password.md) across browser sessions by checking "Remember password" when syncing. This stores the password in localStorage (plaintext) and should only be used on trusted devices.

!!! note "Auto-Clear on Invalid"
    If a remembered password becomes invalid (e.g., password changed on another device), it is automatically cleared when the next sync attempt fails with 401. See [Password Validation](remember-password.md#password-validation) for details.

## Profile Sync State

The `syncedAt` property indicates sync status:

| Value | Meaning | UI Display |
|-------|---------|------------|
| `undefined` | Never synced | "local" + upload button |
| `null` | Was synced, not on server | "not on server" warning |
| `"2026-01-26T..."` | Synced and on server | "synced [date]" |

## Security Considerations

!!! note "End-to-End Encryption"
    All content (diffs, stars, API keys) is [encrypted client-side](encryption.md) before upload. The server only stores encrypted blobs.

!!! warning "Password Salt Exposure"
    The password salt is exposed via [`GET /api/share/{id}`](api.md#get-apishareid) to enable import. This is safe because:

    - Salts are not secrets (stored alongside hashes in standard password systems)
    - The hash itself is never exposed
    - Rate limiting prevents brute-force attacks (5 attempts → 15 min lockout)

### Rate Limiting

Failed password attempts are tracked per-profile:

```typescript
const RATE_LIMIT = {
  MAX_ATTEMPTS: 5,           // Lock after 5 failed attempts
  LOCKOUT_MINUTES: 15,       // Lock for 15 minutes
  ATTEMPT_WINDOW_MINUTES: 5, // Reset counter after 5 min of no attempts
};
```
