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
interface PendingChanges {
  modifiedDiffs: string[];    // IDs of new/changed diffs
  modifiedStars: string[];    // IDs of new/changed stars
  deletedDiffs: string[];     // IDs of deleted diffs
  deletedStars: string[];     // IDs of deleted stars
  profileModified?: boolean;  // Profile metadata changed
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
function scheduleAutoSync(): void {
  if (_autoSyncTimeout) clearTimeout(_autoSyncTimeout);
  _autoSyncTimeout = setTimeout(() => autoSync(), 2000);
}

function syncIfStale(): void {
  const profile = getProfile();
  if (!password || !profile?.syncedAt) return;
  const lastSync = new Date(profile.syncedAt).getTime();
  const oneHour = 60 * 60 * 1000;
  if (Date.now() - lastSync > oneHour) {
    autoSync();
  }
}

async function autoSync(): Promise<void> {
  if (_autoSyncTimeout) clearTimeout(_autoSyncTimeout);
  // Download first (merges server content into local)
  await downloadContentInternal(password);
  // Then upload (sends all local content + deletions)
  if (hasPendingChanges()) {
    await uploadContentInternal(password);
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
if (!hasPendingChanges()) {
  return { uploaded: 0 };
}
```

### Selective Upload

Before uploading, the client checks if the server state matches our last-synced state:

```typescript
// Fetch current server status to compare hashes
const status = await fetch(`/api/profile/${profileId}/status`);
const serverDiffsMatch = status.diffs_hash === profile.diffsHash;
const serverStarsMatch = status.stars_hash === profile.starsHash;
useSelectiveUpload = serverDiffsMatch && serverStarsMatch;
```

**If hashes match** (server unchanged since our last sync):

- Only upload items in `modifiedDiffs` and `modifiedStars`
- Deletions are always sent (just IDs, not content)
- Significantly reduces bandwidth when making small changes

**If hashes don't match** (another device synced):

- Fall back to full upload to ensure consistency
- Server uses `INSERT OR REPLACE` so duplicates are idempotent

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

### Selective Download

The client passes local content hashes to the server to skip unchanged collections:

```typescript
const data = await postJson(`/api/profile/${profileId}/content`, {
  password_hash: passwordHash,
  diffs_hash: localDiffsHash,  // Server skips diffs if hash matches
  stars_hash: localStarsHash   // Server skips stars if hash matches
});
```

The server compares hashes and returns `diffs_skipped: true` or `stars_skipped: true` when collections are unchanged, avoiding unnecessary data transfer.

### Merge Logic

When content is fetched, it's merged into local state:

```typescript
// Add items from server that don't exist locally
for (const encryptedDiff of data.diffs) {
  const diff = await decryptData(encryptedDiff.encrypted_data, password, salt);

  // Skip if already local OR pending deletion
  const existingIdx = mergedHistory.findIndex(d => d.id === encryptedDiff.id);
  if (existingIdx === -1 && !pendingDeletedDiffs.has(encryptedDiff.id)) {
    mergedHistory.push(diff);
  }
}

// Remove local items not on server (deleted by another device)
// Keep items that are: on server, pending local deletion, or pending local upload
mergedHistory = mergedHistory.filter(d =>
  serverDiffIds.has(d.id) || pendingDeletedDiffs.has(d.id) || pendingModifiedDiffs.has(d.id)
);
```

!!! note "Skipped Collections"
    When a collection is skipped (hash matched), the merge and filter logic is also skipped for that collection. This prevents an empty server response from being interpreted as "delete all local items."

### Profile Metadata Sync

Profile metadata (name, languages, frameworks, etc.) is also synced:

```typescript
// Apply server profile metadata (skip if local changes pending)
if (data.profile && !hasLocalProfileChanges) {
  profileUpdates = {
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

Content hashes enable efficient sync by avoiding unnecessary data transfer:

```typescript
// Compute deterministic hash over plaintext content
const sorted = [...items].sort((a, b) => a.id.localeCompare(b.id));
const serialized = sorted.map(item => JSON.stringify(item, Object.keys(item).sort()));
const diffsHash = await sha256(serialized.join('|'));
```

Hashes are computed over **plaintext** (not encrypted data) for deterministic comparison, since encryption produces different ciphertext each time.

### Hash Usage

| Optimization | How Hashes Are Used |
|--------------|---------------------|
| **Skip sync entirely** | Compare local hashes to server hashes - if both match, no sync needed |
| **Selective download** | Pass local hashes to server - skip fetching collections where hash matches |
| **Selective upload** | Compare server hash to profile's stored hash - if unchanged, only upload modified items |

The server stores the hash of the plaintext content (sent by the client after upload) for comparison. Content itself is always encrypted before upload.

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
