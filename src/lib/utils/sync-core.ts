/**
 * Pure data-transform functions shared by both web (lib/utils/sync.ts) and CLI (cli/sync.ts).
 * No I/O — no fetch, no storage, no DOM.
 */
import { encryptData, decryptData, decryptApiKeys, uint8ToBase64, computeContentHash } from './crypto';
import type {
  Diff,
  PendingChanges,
  PendingDeletion,
  EncryptedKeysBlob,
  ProviderSelections,
  ApiKeys,
  ProfileCore,
  Star,
  Tldr
} from '../types/sync';

// Compute deterministic star ID from its semantic identity
export function starId(star: Star): string;
export function starId(diffId: string, pIndex: number): string;
export function starId(starOrDiffId: Star | string, pIndex?: number): string {
  if (typeof starOrDiffId === 'string') {
    return `${starOrDiffId}:${pIndex}`;
  }
  return `${starOrDiffId.diff_id}:${starOrDiffId.p_index}`;
}

/** Compute deterministic TLDR ID (same shape as stars — "diffId:pIndex"). */
export function tldrId(tldr: Tldr): string;
export function tldrId(diffId: string, pIndex: number): string;
export function tldrId(tldrOrDiffId: Tldr | string, pIndex?: number): string {
  if (typeof tldrOrDiffId === 'string') {
    return `${tldrOrDiffId}:${pIndex}`;
  }
  return `${tldrOrDiffId.diff_id}:${tldrOrDiffId.p_index}`;
}

/** Helper: build a Set of ids from a PendingDeletion[] list. */
function deletedIdSet(deletions: PendingDeletion[]): Set<string> {
  return new Set(deletions.map(d => d.id));
}

/** Helper: find the deletion timestamp for a given id, or null. */
function findDeletedAt(deletions: PendingDeletion[], id: string): string | null {
  const match = deletions.find(d => d.id === id);
  return match ? match.deletedAt : null;
}

/** Encrypt diffs that are in the pending-modified set (or all diffs if modifiedIds is null). */
export async function encryptDiffs(
  diffs: Diff[],
  modifiedIds: Set<string> | null,
  password: string,
  salt: string
): Promise<{ id: string; encrypted_data: string }[]> {
  const result: { id: string; encrypted_data: string }[] = [];
  for (const diff of diffs) {
    if (modifiedIds && !modifiedIds.has(diff.id)) continue;
    if (diff.isPublic) {
      const { isPublic, ...diffData } = diff;
      result.push({ id: diff.id, encrypted_data: JSON.stringify(diffData) });
    } else {
      const encrypted = await encryptData(diff, password, salt);
      result.push({ id: diff.id, encrypted_data: encrypted });
    }
  }
  return result;
}

/** Decrypt server diffs (public/private detection), merge with local respecting pending changes.
 *  Also reconciles stale tombstones: if the server has a diff that the client has pending-deleted,
 *  the client's tombstone is stale (the server would have honored any earlier client delete), so
 *  we drop it from `remainingDeletions` and accept the server's diff. Diffs don't have their own
 *  `updated_at` in the encrypted payload, so presence-on-server is treated as newer than the
 *  tombstone — the client would only have a tombstone older than this server entry if another
 *  device wrote the entry after our delete. */
export async function decryptAndMergeDiffs(
  serverDiffs: { id: string; encrypted_data: string }[],
  localDiffs: Diff[],
  pending: PendingChanges,
  password: string,
  salt: string
): Promise<{ merged: Diff[]; downloaded: number; errors: number; remainingDeletions: PendingDeletion[] }> {
  const pendingDeletedDiffsSet = deletedIdSet(pending.deletedDiffs);
  const pendingModifiedDiffs = new Set(pending.modifiedDiffs);
  const serverDiffIds = new Set<string>();
  const staleTombstones = new Set<string>();
  let merged = [...localDiffs];
  let downloaded = 0;
  let errors = 0;

  for (const encryptedDiff of serverDiffs) {
    try {
      let diff: Diff;
      if (encryptedDiff.encrypted_data.startsWith('{')) {
        diff = JSON.parse(encryptedDiff.encrypted_data) as Diff;
        diff.isPublic = true;
      } else {
        diff = await decryptData(encryptedDiff.encrypted_data, password, salt) as Diff;
        diff.isPublic = false;
      }
      serverDiffIds.add(encryptedDiff.id);

      // Stale tombstone reconciliation: server has this diff but client marked it deleted.
      // Server wins — drop the tombstone and accept the server's diff.
      if (pendingDeletedDiffsSet.has(encryptedDiff.id)) {
        staleTombstones.add(encryptedDiff.id);
        const existingIdx = merged.findIndex(d => d.id === encryptedDiff.id);
        if (existingIdx === -1) {
          merged.push(diff);
          downloaded++;
        } else {
          merged[existingIdx] = { ...merged[existingIdx], isPublic: diff.isPublic };
        }
        continue;
      }

      const existingIdx = merged.findIndex(d => d.id === encryptedDiff.id);
      if (existingIdx === -1) {
        merged.push(diff);
        downloaded++;
      } else if (!pendingModifiedDiffs.has(encryptedDiff.id)) {
        // Server wins for non-locally-modified diffs (update isPublic at minimum)
        merged[existingIdx] = { ...merged[existingIdx], isPublic: diff.isPublic };
      }
    } catch {
      errors++;
    }
  }

  // Remove diffs deleted on server (unless locally modified or pending delete)
  merged = merged.filter(d =>
    serverDiffIds.has(d.id) || pendingDeletedDiffsSet.has(d.id) || pendingModifiedDiffs.has(d.id)
  );

  const remainingDeletions = pending.deletedDiffs.filter(d => !staleTombstones.has(d.id));

  return { merged, downloaded, errors, remainingDeletions };
}

/** Encrypt stars that are in the pending-modified set (or all stars if modifiedIds is null). */
export async function encryptStars(
  stars: Star[],
  modifiedIds: Set<string> | null,
  password: string,
  salt: string
): Promise<{ id: string; encrypted_data: string }[]> {
  const result: { id: string; encrypted_data: string }[] = [];
  for (const star of stars) {
    const id = starId(star);
    if (modifiedIds && !modifiedIds.has(id)) continue;
    const encrypted = await encryptData(star, password, salt);
    result.push({ id, encrypted_data: encrypted });
  }
  return result;
}

/** Compute a deterministic hash over stars (with IDs added for consistency). */
export async function computeStarsHash(stars: Star[]): Promise<string> {
  const starsWithIds = stars.map(s => ({ ...s, id: starId(s) }));
  return computeContentHash(starsWithIds);
}

/** Decrypt server stars, merge with local respecting pending changes.
 *  Stars don't carry an updated_at in their payload — if a server star exists despite a pending
 *  tombstone, another device must have re-created it after our delete, so the tombstone is stale
 *  and we accept the server's star. */
export async function decryptAndMergeStars(
  serverStars: { id: string; encrypted_data: string }[],
  localStars: Star[],
  pending: PendingChanges,
  password: string,
  salt: string
): Promise<{ merged: Star[]; downloaded: number; errors: number; remainingDeletions: PendingDeletion[] }> {
  const pendingDeletedStarsSet = deletedIdSet(pending.deletedStars);
  const pendingModifiedStars = new Set(pending.modifiedStars);
  const serverStarIds = new Set<string>();
  const staleTombstones = new Set<string>();
  let merged = [...localStars];
  let downloaded = 0;
  let errors = 0;

  for (const encryptedStar of serverStars) {
    try {
      const star = await decryptData(encryptedStar.encrypted_data, password, salt) as Star;
      serverStarIds.add(encryptedStar.id);

      if (pendingDeletedStarsSet.has(encryptedStar.id)) {
        // Stale tombstone: server has this star, accept it and drop the tombstone
        staleTombstones.add(encryptedStar.id);
        const existingIdx = merged.findIndex(s => starId(s) === encryptedStar.id);
        if (existingIdx === -1) {
          merged.push(star);
          downloaded++;
        }
        continue;
      }

      const existingIdx = merged.findIndex(s => starId(s) === encryptedStar.id);
      if (existingIdx === -1) {
        merged.push(star);
        downloaded++;
      }
    } catch {
      errors++;
    }
  }

  // Remove stars deleted on server (keep pending-deleted and pending-modified as-is)
  const beforeCount = merged.length;
  merged = merged.filter(s => {
    const id = starId(s);
    const keep = serverStarIds.has(id) || pendingDeletedStarsSet.has(id) || pendingModifiedStars.has(id);
    if (!keep) {
      console.warn(`[Sync] Dropping local star ${id} — not on server (${serverStarIds.size} server stars), not in pending modified (${pendingModifiedStars.size}), not in pending deleted (${pendingDeletedStarsSet.size})`);
    }
    return keep;
  });
  if (merged.length < beforeCount) {
    console.warn(`[Sync] Star merge: ${beforeCount} → ${merged.length} (dropped ${beforeCount - merged.length}). Server stars: [${[...serverStarIds].join(', ')}], Pending modified: [${[...pendingModifiedStars].join(', ')}]`);
  }

  const remainingDeletions = pending.deletedStars.filter(d => !staleTombstones.has(d.id));

  return { merged, downloaded, errors, remainingDeletions };
}

/** Encrypt TLDRs that are in the pending-modified set (or all TLDRs if modifiedIds is null). */
export async function encryptTldrs(
  tldrs: Tldr[],
  modifiedIds: Set<string> | null,
  password: string,
  salt: string
): Promise<{ id: string; encrypted_data: string }[]> {
  const result: { id: string; encrypted_data: string }[] = [];
  for (const tldr of tldrs) {
    const id = tldrId(tldr);
    if (modifiedIds && !modifiedIds.has(id)) continue;
    const encrypted = await encryptData(tldr, password, salt);
    result.push({ id, encrypted_data: encrypted });
  }
  return result;
}

/** Compute a deterministic hash over TLDRs (with IDs added for consistency). */
export async function computeTldrsHash(tldrs: Tldr[]): Promise<string> {
  const tldrsWithIds = tldrs.map(t => ({ ...t, id: tldrId(t) }));
  return computeContentHash(tldrsWithIds);
}

/** Decrypt server TLDRs, merge with local respecting pending changes.
 *  Uses last-write-wins by `updated_at` for conflicts. Tombstones are reconciled by comparing
 *  the server's `updated_at` against the local `deletedAt`: if the server entry is newer, the
 *  tombstone is stale and gets dropped — we accept the server's TLDR. */
export async function decryptAndMergeTldrs(
  serverTldrs: { id: string; encrypted_data: string }[],
  localTldrs: Tldr[],
  pending: PendingChanges,
  password: string,
  salt: string
): Promise<{ merged: Tldr[]; downloaded: number; errors: number; remainingDeletions: PendingDeletion[] }> {
  const pendingDeletedTldrsSet = deletedIdSet(pending.deletedTldrs);
  const pendingModifiedTldrs = new Set(pending.modifiedTldrs);
  const serverTldrIds = new Set<string>();
  const staleTombstones = new Set<string>();
  let merged = [...localTldrs];
  let downloaded = 0;
  let errors = 0;

  for (const encryptedTldr of serverTldrs) {
    try {
      const tldr = await decryptData(encryptedTldr.encrypted_data, password, salt) as Tldr;
      serverTldrIds.add(encryptedTldr.id);
      const serverUpdatedAt = tldr.updated_at || tldr.created_at || '';

      if (pendingDeletedTldrsSet.has(encryptedTldr.id)) {
        const deletedAt = findDeletedAt(pending.deletedTldrs, encryptedTldr.id);
        // If server's updated_at is newer than our tombstone, tombstone is stale — accept server's TLDR
        if (deletedAt && serverUpdatedAt > deletedAt) {
          staleTombstones.add(encryptedTldr.id);
          const existingIdx = merged.findIndex(t => tldrId(t) === encryptedTldr.id);
          if (existingIdx === -1) {
            merged.push(tldr);
            downloaded++;
          } else {
            merged[existingIdx] = tldr;
          }
        }
        // Otherwise: keep the tombstone; upload phase will delete the stale server row
        continue;
      }

      const existingIdx = merged.findIndex(t => tldrId(t) === encryptedTldr.id);
      if (existingIdx === -1) {
        if (!pendingModifiedTldrs.has(encryptedTldr.id)) {
          merged.push(tldr);
          downloaded++;
        }
      } else if (!pendingModifiedTldrs.has(encryptedTldr.id)) {
        // Last-write-wins by updated_at
        const local = merged[existingIdx];
        const localUpdatedAt = local.updated_at || local.created_at || '';
        if (serverUpdatedAt > localUpdatedAt) {
          merged[existingIdx] = tldr;
        }
      }
    } catch {
      errors++;
    }
  }

  // Remove TLDRs deleted on server (keep pending-deleted and pending-modified)
  merged = merged.filter(t => {
    const id = tldrId(t);
    return serverTldrIds.has(id) || pendingDeletedTldrsSet.has(id) || pendingModifiedTldrs.has(id);
  });

  const remainingDeletions = pending.deletedTldrs.filter(d => !staleTombstones.has(d.id));

  return { merged, downloaded, errors, remainingDeletions };
}

/** Decrypt an encrypted keys blob, handling new and legacy formats.
 *  Format 1 (newest): EncryptedKeysBlob JSON { apiKeys, providerSelections }
 *  Format 2: Record<string, string> JSON { anthropic: "sk-...", ... }
 *  Format 3 (oldest): raw API key string (single Anthropic key)
 */
export async function decryptKeysBlob(
  encryptedApiKey: string,
  password: string,
  salt: string
): Promise<{ apiKeys: Record<string, string>; providerSelections: ProviderSelections }> {
  try {
    const decrypted = await decryptData<EncryptedKeysBlob | Record<string, string>>(
      encryptedApiKey, password, salt
    );

    if (decrypted && typeof decrypted === 'object' && 'apiKeys' in decrypted) {
      const blob = decrypted as EncryptedKeysBlob;
      return {
        apiKeys: blob.apiKeys,
        providerSelections: blob.providerSelections || {}
      };
    }

    // Legacy format 2: Record<string, string> (just API keys)
    const apiKeys = decrypted as Record<string, string>;
    return {
      apiKeys,
      providerSelections: inferProviderSelections(apiKeys)
    };
  } catch {
    // Legacy format 3: raw string — fall back to decryptApiKeys
    const apiKeys = await decryptApiKeys(encryptedApiKey, salt, password);
    return {
      apiKeys,
      providerSelections: inferProviderSelections(apiKeys)
    };
  }
}

/** Infer provider selections from available API keys (legacy fallback). */
export function inferProviderSelections(apiKeys: Record<string, string>): ProviderSelections {
  const selections: ProviderSelections = {};
  if (apiKeys.anthropic) {
    selections.search = 'anthropic';
    selections.curation = 'anthropic';
    selections.synthesis = 'anthropic';
  } else if (apiKeys.deepseek) {
    selections.curation = 'deepseek';
    selections.synthesis = 'deepseek';
  } else if (apiKeys.gemini) {
    selections.curation = 'gemini';
    selections.synthesis = 'gemini';
  }
  if (apiKeys.serper) {
    selections.search = 'serper';
  } else if (apiKeys.perplexity) {
    selections.search = 'perplexity';
  }
  return selections;
}

/** Build profile metadata object for upload. */
export function buildProfileMetadata(profile: ProfileCore): {
  name: string;
  languages: string[] | undefined;
  frameworks: string[] | undefined;
  tools: string[] | undefined;
  topics: string[] | undefined;
  depth: string;
  custom_focus: string;
} {
  return {
    name: profile.name,
    languages: profile.languages,
    frameworks: profile.frameworks,
    tools: profile.tools,
    topics: profile.topics,
    depth: String(profile.depth),
    custom_focus: profile.customFocus
  };
}

/** Construct the sync POST body. */
export function buildSyncPayload(opts: {
  passwordHash: string;
  diffs: { id: string; encrypted_data: string }[];
  deletedDiffIds: string[];
  diffsHash: string;
  starsHash: string;
  tldrsHash?: string;
  stars?: { id: string; encrypted_data: string }[];
  deletedStarIds?: string[];
  tldrs?: { id: string; encrypted_data: string }[];
  deletedTldrIds?: string[];
  encryptedApiKey?: string;
  keysHash?: string;
  profile?: ReturnType<typeof buildProfileMetadata>;
}): Record<string, unknown> {
  return {
    password_hash: opts.passwordHash,
    diffs: opts.diffs,
    stars: opts.stars || [],
    tldrs: opts.tldrs || [],
    deleted_diff_ids: opts.deletedDiffIds,
    deleted_star_ids: opts.deletedStarIds || [],
    deleted_tldr_ids: opts.deletedTldrIds || [],
    diffs_hash: opts.diffsHash,
    stars_hash: opts.starsHash,
    tldrs_hash: opts.tldrsHash,
    encrypted_api_key: opts.encryptedApiKey,
    keys_hash: opts.keysHash,
    profile: opts.profile
  };
}

/** Sort diffs newest first by generated_at. */
export function sortDiffsNewestFirst<T extends { generated_at: string }>(diffs: T[]): T[] {
  return diffs.sort((a, b) =>
    new Date(b.generated_at).getTime() - new Date(a.generated_at).getTime()
  );
}

/** Build the filtered apiKeys record (non-empty values only) for encryption. */
export function buildApiKeysRecord(apiKeys?: ApiKeys): Record<string, string> {
  const record: Record<string, string> = {};
  if (apiKeys) {
    Object.entries(apiKeys).forEach(([key, value]) => {
      if (value) record[key] = value;
    });
  }
  return record;
}

/** Compute a deterministic hash over API keys and provider selections. */
export async function computeKeysHash(
  apiKeys?: ApiKeys,
  providerSelections?: ProviderSelections
): Promise<string> {
  const payload = {
    apiKeys: apiKeys ? Object.fromEntries(
      Object.entries(apiKeys).filter(([, v]) => v).sort()
    ) : {},
    providerSelections: providerSelections ? Object.fromEntries(
      Object.entries(providerSelections).filter(([, v]) => v != null).sort()
    ) : {}
  };
  const data = new TextEncoder().encode(JSON.stringify(payload));
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return uint8ToBase64(new Uint8Array(hashBuffer));
}
