# Sync TLDRs across devices

**Date:** 2026-04-13
**Status:** Approved design, ready for implementation plan

## Problem

TLDR article summaries currently live only in `localStorage` (`difflog-tldrs`). Each TLDR costs an AI lookup to generate, so regenerating on every device is wasteful. Now that desktop and mobile have feature parity, TLDRs should be shared data that syncs like diffs and stars.

## Approach

Treat TLDRs as a third encrypted collection alongside diffs and stars, using the existing sync mechanics (selective upload, content-hash change detection, last-write-wins merge, password-verified endpoints). Fix a latent offline-deletion race that affects both stars and the new TLDR collection.

## Data model

### Local (`src/lib/stores/tldrs.svelte.ts`)

Shape unchanged: `Record<profileId, Record<"diffId:pIndex", TldrEntry>>`.

```ts
export interface TldrEntry {
  summary: string;
  url: string;
  created_at: string;
  updated_at: string;  // NEW — powers last-write-wins merges
}
```

Existing `setTldr` and `removeTldr` gain `operations.svelte.ts` wrappers so they can record pending sync changes the same way stars do.

### Server (`migrations/0004_add_tldrs.sql`)

```sql
CREATE TABLE IF NOT EXISTS tldrs (
  id TEXT PRIMARY KEY,                -- "diffId:pIndex" (diffIds are globally unique UUIDs)
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  encrypted_data TEXT NOT NULL,       -- base64(AES-GCM encrypted JSON of TldrEntry)
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tldrs_profile ON tldrs(profile_id);

ALTER TABLE profiles ADD COLUMN tldrs_hash TEXT;
```

Profile-delete cascade is handled by the FK. Permissions match existing collections: all read/write flows through `/api/profile/[id]/sync` and `/api/profile/[id]/content`, which verify `password_hash` via `verifyAndUpgrade` before any access. No new endpoints.

## Sync pipeline changes

### `PendingChanges` shape (`src/lib/types/sync.ts`)

Tombstones gain timestamps so stale offline deletions can be reconciled:

```ts
export interface PendingDeletion {
  id: string;
  deletedAt: string;  // ISO timestamp
}

export interface PendingChanges {
  modifiedDiffs: string[];
  modifiedStars: string[];
  modifiedTldrs: string[];          // NEW
  deletedDiffs: PendingDeletion[];  // CHANGED from string[]
  deletedStars: PendingDeletion[];  // CHANGED from string[]
  deletedTldrs: PendingDeletion[];  // NEW
  profileModified: boolean;
  keysModified: boolean;
}
```

`trackChange` records `deletedAt = new Date().toISOString()` on any `'deleted'` action and gains a `'tldr'` type in `CHANGE_HANDLERS`.

A one-shot migration reads any existing `difflog-pending-sync` payload and upgrades `string[]` tombstones to `PendingDeletion[]` with `deletedAt = now()` (best available approximation for pre-existing tombstones).

### `sync-core.ts`

New helpers mirroring the star equivalents:

- `computeTldrsHash(tldrs)` — SHA-256 over plaintext sorted by id
- `encryptTldrs(tldrs, modifiedIds?, password, salt)` — selective or full encryption
- `decryptAndMergeTldrs(serverTldrs, localTldrs, pending, password, salt)` — last-write-wins by `updated_at`; also drops stale tombstones (see "Offline-deletion reconciliation" below)

### `sync.ts`

- `checkStatus` computes `localTldrsHash` and includes `tldrs_hash` in the comparison
- `uploadContent` encrypts and uploads TLDRs (selective or full), sends `tldrs_hash`, sends `deleted_tldr_ids` (just the ids; server does not need `deletedAt`)
- `downloadContent` decrypts and merges TLDRs, honoring `tldrs_skipped`, and reconciles stale tombstones for diffs/stars/tldrs uniformly
- `updatePassword` re-encrypts all TLDRs with new salt/password

### Offline-deletion reconciliation

Download happens before upload in the sync flow. During `decryptAndMerge*`:

- For each server entry whose id is in `pending.deletedX`, compare `server.updated_at` to the tombstone's `deletedAt`
- If `server.updated_at > deletedAt` → the server's entry is newer (written by another device after this client's offline delete). Drop the tombstone from `remainingPending.deletedX`, accept the server's entry into local state.
- Otherwise keep the tombstone; the upload phase will delete the stale server row.

Applied uniformly to diffs, stars, and tldrs — identical code shape, one reconciliation helper.

### Server handlers

`src/routes/api/profile/[id]/sync/+server.ts`:
- Add per-id `INSERT OR REPLACE INTO tldrs` block
- Add `deleted_tldr_ids` → `DELETE FROM tldrs WHERE id = ? AND profile_id = ?` block
- Extend diff-deletion loop to cascade: `DELETE FROM tldrs WHERE profile_id = ? AND id LIKE ? || ':%'` for each deleted diff id, in the same batch
- Add conditional `tldrs_hash = ?` UPDATE clause

`src/routes/api/profile/[id]/content/+server.ts`:
- Accept `tldrs_hash` in request body
- Return `tldrs: { id, encrypted_data }[]` and `tldrs_skipped: boolean` (skipped when client hash matches server hash)

`src/routes/api/profile/[id]/status/+server.ts`:
- Include `tldrs_hash` in the status response

Existing `SyncRequest` / response types in `src/routes/api/types.ts` gain the new optional fields. Servers and clients tolerate their absence for backward compatibility.

## Client composite operations (`operations.svelte.ts`)

- `addTldr(diffId, pIndex, entry)` — writes TLDR with fresh `updated_at`, tracks as modified
- `deleteTldr(diffId, pIndex)` — removes locally, tracks as deleted with `deletedAt = now()`
- `deleteDiff(diffId)` — unchanged in intent: enqueues `deletedDiffs`, calls `removeTldrsForDiff(diffId)` locally. Does **not** enqueue per-TLDR tombstones — the server cascades, and double-tracking is unnecessary bandwidth.

## First-sync migration for existing local TLDRs

On the first successful status-check for a profile where:
- Server returns `tldrs_hash = null` (table is empty for this profile)
- Client has non-empty local TLDRs for this profile

The client marks every local TLDR id as `modifiedTldrs` in pending, triggering a one-time full upload on the next sync. This is a client-only behavior; no server-side migration.

## Rollout / compatibility

- New migration applied via `bun run db:migrate` (local) then against remote D1
- Server tolerates clients that omit `tldrs`, `deleted_tldr_ids`, `tldrs_hash` (all optional in `SyncRequest`)
- Clients tolerate servers that omit `tldrs` / `tldrs_skipped` in the content response (treat as empty, skipped)
- Older clients continue to function — they just won't sync TLDRs

## Testing

Unit tests (`bun test`):
- `sync-core`: `computeTldrsHash`, `encryptTldrs`, `decryptAndMergeTldrs` (mirror star tests)
- `sync-core`: stale-tombstone reconciliation — server entry with `updated_at > deletedAt` drops the tombstone and accepts the server entry; reverse case preserves the tombstone
- `sync.ts`: first-sync migration (local TLDRs present, server hash null → all marked modified)
- `sync.ts`: diff-deletion cascade — deleting a diff does not enqueue individual TLDR tombstones; server cascade is trusted
- `sync.ts`: PendingChanges migration from `string[]` to `PendingDeletion[]`

Manual verification:
1. Generate TLDRs on device A → sync → sign in on device B → TLDRs appear
2. Delete TLDR on B → sync → A reflects deletion after its next sync
3. Delete a diff on A → sync → B's TLDRs for that diff are gone (cascade)
4. Offline conflict: TLDRs for same paragraph created on A and B → later `updated_at` wins after sync
5. Offline-deletion race: A (offline) deletes TLDR, B generates a newer one for the same paragraph and syncs, A reconnects → A accepts B's newer entry and drops its stale tombstone
6. Same race for a star → same reconciliation behavior
