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
| **Password Salt** (client) | SHA-256 transport hash | In `password_salt` column |
| **Server Salt** | PBKDF2 server-side hash | In `password_hash` field (v2 format) |
| **Encryption Salt** | AES-GCM encryption of content | In `salt` field |

!!! warning "Important"
    These are different values. The password salt is for constructing the transport hash, the server salt protects against DB breach cracking, and the encryption salt is for encrypting API keys and content.

### Password Hashing

Passwords are hashed in two layers — see [Encryption: Password Hashing](encryption.md#password-hashing) for details:

1. **Client-side**: SHA-256 with client salt → transport hash (`clientSalt:base64(digest)`)
2. **Server-side**: PBKDF2 (100k iterations) with server salt → stored hash (`v2:serverSalt:base64(derivedKey)`)

```typescript
// Client: hash before sending
async function hashPasswordForTransport(password: string, salt?: string): Promise<string> {
  const saltValue = salt || generateRandomSalt(); // (1)!
  const data = encoder.encode(saltValue + password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return saltValue + ':' + base64(hashBuffer);
}
```

1. If no salt provided, generates random 16-byte salt. For auth verification, **must** use the existing salt from the server.

Legacy profiles with v1 hashes (plain transport hashes) are automatically upgraded to v2 on successful authentication.

## Sync Flow

### Initial Share (Primary Device)

``` mermaid
sequenceDiagram
    participant C as Client
    participant S as Server
    participant DB as D1 Database

    C->>C: Generate password hash (new salt)
    C->>C: Encrypt all API keys with AES-GCM
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
    C->>C: Decrypt all API keys
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

Changes are tracked in `pendingSync` (persisted to localStorage). The current shape includes TLDRs and an API-keys flag, and tracks deletions as `{id, deletedAt}` tombstones so stale deletions can be reconciled against the server:

```typescript
interface PendingDeletion {
  id: string;
  deletedAt: string; // ISO timestamp
}

interface PendingChanges {
  modifiedDiffs: string[];
  modifiedStars: string[];
  modifiedTldrs: string[];
  deletedDiffs: PendingDeletion[];
  deletedStars: PendingDeletion[];
  deletedTldrs: PendingDeletion[];
  profileModified?: boolean;
  keysModified?: boolean;     // API keys / provider / model selections changed
}
```

`keysModified` is the trigger for re-encrypting and re-uploading the keys blob (see [Keys Blob Sync](#keys-blob-sync) below).

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

async function autoSync(): Promise<void> {
  if (_syncing) return;
  if (_autoSyncTimeout) clearTimeout(_autoSyncTimeout);
  _syncing = true;
  try {
    await syncContent();             // download → upload
  } catch (err) {
    if (is401(err)) {
      // Try refreshing passwordSalt once before giving up
      const refreshed = await refreshPasswordSalt();
      if (refreshed) {
        return autoSync();
      }
      handleSyncError(err);
    } else {
      handleSyncError(err);
    }
  } finally {
    _syncing = false;
  }
}
```

The real implementation lives in `src/lib/stores/sync.svelte.ts`; the snippet above mirrors its shape. `syncContent` itself downloads first, then uploads if pending changes exist.

!!! important "Deletion Preservation"
    The download phase preserves `deletedDiffs` and `deletedStars` so they're available when upload runs. Without this, deletions would be lost between download and upload.

### Password Change on Another Device

When a password is changed on one device, other devices have a stale `passwordSalt` stored locally. This means even the correct new password would produce the wrong transport hash.

**Automatic salt refresh:** On a 401 error, the client fetches the current `passwordSalt` from the unauthenticated `/api/share/{id}` endpoint. If the salt has changed, it updates the local profile and retries the sync once. This makes password changes seamless across devices — entering the new password "just works."

**If the salt hasn't changed** (genuinely wrong password), the cached password is cleared:

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

Deleted items are tracked as `{id, deletedAt}` tombstones and sent to the server:

```typescript
body: JSON.stringify({
  diffs: diffsToUpload,
  stars: starsToUpload,
  tldrs: tldrsToUpload,
  deleted_diff_ids: pending?.deletedDiffs.map(d => d.id) || [],
  deleted_star_ids: pending?.deletedStars.map(d => d.id) || [],
  deleted_tldr_ids: pending?.deletedTldrs.map(d => d.id) || [],
})
```

!!! note "Cascade Deletes"
    When a diff is deleted, all stars referencing it are automatically deleted too. This happens both for manual deletions and when regenerating a same-day diff (which replaces the previous one). The old diff is tracked as deleted so it gets removed from the server on sync.

### Keys Blob Sync

API keys, `providerSelections`, and `modelSelections` are bundled into an `EncryptedKeysBlob`, encrypted with the sync password, and stored alongside the profile (`profiles.encrypted_api_key`). A `keys_hash` is sent on every sync request/response so the server and client can skip re-uploading or re-downloading the blob when it hasn't changed:

- The local profile sets `pending.keysModified = true` whenever apiKeys / providerSelections / modelSelections change (`trackKeysModified` in `src/lib/stores/sync.svelte.ts`).
- During upload, a `true` flag re-encrypts the blob with the current salt and POSTs `encrypted_api_key` + `keys_hash`.
- Download includes `encrypted_api_key`, `keys_hash`, and `keys_skipped` (true when the local `keys_hash` matched the server's).
- After a successful merge, `keys_hash` is stored on the profile for future skip checks.

### TLDR Sync

TLDR summaries are first-class synced content. The status, content, and sync endpoints all accept and return `tldrs`, `tldrs_hash`, `tldrs_skipped`, and `deleted_tldr_ids` fields with the same shape as diffs and stars. TLDRs participate in selective upload/download via `tldrs_hash`, and the profile records a `tldrsHash` cache for skip decisions.

### `modelSelections` Migration Flag

Existing profiles that pre-date the per-step model picker get a one-time seed of `modelSelections` derived from each provider's `previousDefault`. The migration is recorded on the profile as `migrations.modelSelectionsSeeded: true`. On merge, the rule is:

- If **remote** ran the seed and **local** hasn't → adopt remote `modelSelections` wholesale. This prevents a freshly-installed client from clobbering deliberate picks with its own seeded defaults.
- Otherwise → local-precedence merge over remote (the usual rule).

See `src/lib/utils/sync.ts:610-626`.

## Download Logic

### Selective Download

The client passes local content hashes to the server to skip unchanged collections:

```typescript
const data = await postJson(`/api/profile/${profileId}/content`, {
  password_hash: passwordHash,
  diffs_hash: localDiffsHash,
  stars_hash: localStarsHash,
  tldrs_hash: localTldrsHash,
  keys_hash: localKeysHash
});
```

The server compares hashes and returns `diffs_skipped`, `stars_skipped`, `tldrs_skipped`, or `keys_skipped: true` when the corresponding collection is unchanged, avoiding unnecessary data transfer.

### Merge Logic

When content is fetched, it's merged into local state. The actual merge (in `src/lib/utils/sync-core.ts`) also reconciles stale deletion tombstones — if the local pending list says "I deleted X" but the server still has X, the deletion is dropped from the pending list and replayed against the server on next upload:

```typescript
// Add items from server that don't exist locally and aren't pending deletion
for (const encryptedDiff of data.diffs) {
  const diff = await decryptData(encryptedDiff.encrypted_data, password, salt);
  const isPendingDelete = pendingDeletedDiffs.has(encryptedDiff.id);
  const existingIdx = mergedHistory.findIndex(d => d.id === encryptedDiff.id);
  if (existingIdx === -1 && !isPendingDelete) {
    mergedHistory.push(diff);
  }
}

// Stale-tombstone reconciliation: drop deletions for items still on server
const remainingDeletions = pendingDeletions.filter(d => !serverIds.has(d.id));

// Remove local items missing from server (deleted by another device)
mergedHistory = mergedHistory.filter(d =>
  serverDiffIds.has(d.id) || pendingModifiedDiffs.has(d.id)
);
```

The merge returns `remainingDeletions` so the sync store can rewrite `pending.deletedDiffs/Stars/Tldrs` after each download, keeping tombstones only for items the server still needs to be told about.

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

- Cached on successful download (and on `shareProfile`/`importProfile` before the content step, so a mid-flow failure doesn't lose the password)
- Enables auto-sync without re-entering password
- **Cleared on profile switch** by `switchProfileWithSync`, which then immediately calls `restoreSessionPassword` to promote any remembered password for the newly active profile
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

## Remove from Server

Users can permanently delete their synced profile from the server via the setup wizard. This requires re-entering the sync password for confirmation.

The `removeFromServer(password)` function:

1. Verifies the password against the server's stored hash
2. Calls `DELETE /api/profile/{id}` to remove all server data (profile, diffs, stars, TLDRs)
3. Clears local sync state — `syncedAt`, `passwordSalt`, `salt`, `diffsHash`, `starsHash`, `tldrsHash`, `keysHash`
4. Clears cached and remembered passwords
5. Clears pending sync queue

The profile reverts to local-only — all local data (diffs, stars, settings) is preserved.

## Security Considerations

!!! note "End-to-End Encryption"
    All content (diffs, stars, and all API keys - Anthropic, DeepSeek, Gemini, Perplexity, Serper) is [encrypted client-side](encryption.md) before upload. The server only stores encrypted blobs.

!!! warning "Password Salt Exposure"
    The password salt is exposed via [`GET /api/share/{id}`](api.md#get-apishareid) to enable import. This is safe because:

    - Salts are not secrets (stored alongside hashes in standard password systems)
    - The hash itself is never exposed
    - Rate limiting prevents brute-force attacks (5 attempts → 10 min lockout)

### Rate Limiting

Failed password attempts are tracked per-profile (`src/routes/api/types.ts`):

```typescript
const RATE_LIMIT = {
  MAX_ATTEMPTS: 5,           // Lock after 5 failed attempts
  LOCKOUT_MINUTES: 10,       // Lock for 10 minutes
  ATTEMPT_WINDOW_MINUTES: 5  // Reset counter after 5 min of no attempts
};
```
