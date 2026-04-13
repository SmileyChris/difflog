import {
  encryptApiKeys,
  hashPasswordForTransport,
  encryptData,
  computeContentHash,
  uint8ToBase64
} from './crypto';
import { type GenerationDepth } from './constants';
import { fetchJson, postJson } from './api';
import { STORAGE_KEYS } from './constants';
import {
  starId,
  tldrId,
  computeKeysHash,
  encryptDiffs,
  encryptStars,
  encryptTldrs,
  computeStarsHash,
  computeTldrsHash,
  decryptAndMergeDiffs,
  decryptAndMergeStars,
  decryptAndMergeTldrs,
  decryptKeysBlob,
  buildProfileMetadata,
  buildSyncPayload,
  sortDiffsNewestFirst,
  buildApiKeysRecord
} from './sync-core';

export { starId, tldrId, computeKeysHash } from './sync-core';

// Re-export shared types from canonical location
export type {
  Diff,
  Star,
  Tldr,
  PendingChanges,
  PendingDeletion,
  ApiKeys,
  ProviderSelections,
  EncryptedKeysBlob,
  ResolvedMapping,
  SyncStatus,
  SyncResult,
  ProfileCore
} from '../types/sync';

// Import types for use in this file
import type {
  Diff,
  Star,
  Tldr,
  PendingChanges,
  PendingDeletion,
  ApiKeys,
  ProviderSelections,
  EncryptedKeysBlob,
  ResolvedMapping,
  SyncStatus,
  ProfileCore
} from '../types/sync';

/**
 * Get Anthropic API key from profile
 */
export function getAnthropicKey(profile: { apiKeys?: ApiKeys }): string | undefined {
  return profile.apiKeys?.anthropic;
}

export interface Profile extends ProfileCore {
  apiKeys?: ApiKeys;
  salt?: string;
  passwordSalt?: string;
  syncedAt?: string | null;
  createdAt?: string;
  depth: GenerationDepth;
  resolvedMappings?: Record<string, ResolvedMapping>;
  [key: string]: unknown;
}

// Session password management
export function getSyncPassword(): string | null {
  return sessionStorage.getItem(STORAGE_KEYS.SYNC_PASSWORD);
}

export function setSyncPassword(val: string | null): void {
  if (val) {
    sessionStorage.setItem(STORAGE_KEYS.SYNC_PASSWORD, val);
  } else {
    sessionStorage.removeItem(STORAGE_KEYS.SYNC_PASSWORD);
  }
}

// Remembered password management (localStorage, per-profile)
function getRememberedPasswords(): Record<string, string> {
  const stored = localStorage.getItem(STORAGE_KEYS.REMEMBERED_PASSWORDS);
  if (!stored) return {};
  try {
    return JSON.parse(stored);
  } catch {
    return {};
  }
}

function setRememberedPasswords(passwords: Record<string, string>): void {
  localStorage.setItem(STORAGE_KEYS.REMEMBERED_PASSWORDS, JSON.stringify(passwords));
}

export function getRememberedPassword(profileId: string): string | null {
  const passwords = getRememberedPasswords();
  return passwords[profileId] || null;
}

export function setRememberedPassword(profileId: string, password: string): void {
  const passwords = getRememberedPasswords();
  passwords[profileId] = password;
  setRememberedPasswords(passwords);
}

export function clearRememberedPassword(profileId: string): void {
  const passwords = getRememberedPasswords();
  delete passwords[profileId];
  setRememberedPasswords(passwords);
}

export function hasRememberedPassword(profileId: string): boolean {
  const passwords = getRememberedPasswords();
  return profileId in passwords;
}

// Change tracking
export function createEmptyPending(): PendingChanges {
  return {
    modifiedDiffs: [],
    modifiedStars: [],
    modifiedTldrs: [],
    deletedDiffs: [],
    deletedStars: [],
    deletedTldrs: [],
    profileModified: false,
    keysModified: false
  };
}

/** Configuration for change tracking by type and action */
const CHANGE_HANDLERS = {
  diff: {
    modified: { modifiedKey: 'modifiedDiffs', deletedKey: 'deletedDiffs' },
    deleted: { modifiedKey: 'modifiedDiffs', deletedKey: 'deletedDiffs' }
  },
  star: {
    modified: { modifiedKey: 'modifiedStars', deletedKey: 'deletedStars' },
    deleted: { modifiedKey: 'modifiedStars', deletedKey: 'deletedStars' }
  },
  tldr: {
    modified: { modifiedKey: 'modifiedTldrs', deletedKey: 'deletedTldrs' },
    deleted: { modifiedKey: 'modifiedTldrs', deletedKey: 'deletedTldrs' }
  }
} as const;

type ModifiedKeys = 'modifiedDiffs' | 'modifiedStars' | 'modifiedTldrs';
type DeletedKeys = 'deletedDiffs' | 'deletedStars' | 'deletedTldrs';

/** Normalize any upgraded-from-legacy tombstone list (string[]) to PendingDeletion[] */
function normalizeDeletions(raw: unknown): PendingDeletion[] {
  if (!Array.isArray(raw)) return [];
  const now = new Date().toISOString();
  return raw.map(item => {
    if (typeof item === 'string') return { id: item, deletedAt: now };
    if (item && typeof item === 'object' && 'id' in item && 'deletedAt' in item) {
      return item as PendingDeletion;
    }
    return null;
  }).filter((x): x is PendingDeletion => x !== null);
}

/** Upgrade a legacy pending-changes record to the current shape. Idempotent. */
export function upgradePendingChanges(raw: Partial<PendingChanges> & {
  deletedDiffs?: unknown;
  deletedStars?: unknown;
  deletedTldrs?: unknown;
}): PendingChanges {
  return {
    modifiedDiffs: raw.modifiedDiffs || [],
    modifiedStars: raw.modifiedStars || [],
    modifiedTldrs: raw.modifiedTldrs || [],
    deletedDiffs: normalizeDeletions(raw.deletedDiffs),
    deletedStars: normalizeDeletions(raw.deletedStars),
    deletedTldrs: normalizeDeletions(raw.deletedTldrs),
    profileModified: raw.profileModified || false,
    keysModified: raw.keysModified || false
  };
}

export function trackChange(
  pending: PendingChanges,
  type: 'diff' | 'star' | 'tldr',
  action: 'modified' | 'deleted',
  id: string
): PendingChanges {
  const { modifiedKey, deletedKey } = CHANGE_HANDLERS[type][action];
  const result = { ...pending };

  if (action === 'modified') {
    // Remove from deletions, add to modifications
    result[deletedKey as DeletedKeys] = result[deletedKey as DeletedKeys].filter(d => d.id !== id);
    if (!result[modifiedKey as ModifiedKeys].includes(id)) {
      result[modifiedKey as ModifiedKeys] = [...result[modifiedKey as ModifiedKeys], id];
    }
  } else {
    // Remove from modifications, add to deletions with timestamp
    result[modifiedKey as ModifiedKeys] = result[modifiedKey as ModifiedKeys].filter(i => i !== id);
    const existing = result[deletedKey as DeletedKeys].find(d => d.id === id);
    if (!existing) {
      result[deletedKey as DeletedKeys] = [
        ...result[deletedKey as DeletedKeys],
        { id, deletedAt: new Date().toISOString() }
      ];
    }
  }

  return result;
}

export function hasPendingChanges(pending: PendingChanges | null): boolean {
  if (!pending) return false;
  return pending.profileModified ||
    pending.keysModified ||
    pending.modifiedDiffs.length > 0 ||
    pending.modifiedStars.length > 0 ||
    pending.modifiedTldrs.length > 0 ||
    pending.deletedDiffs.length > 0 ||
    pending.deletedStars.length > 0 ||
    pending.deletedTldrs.length > 0;
}

// API operations

/**
 * Check sync status with server
 */
export async function checkStatus(
  profileId: string,
  profile: Profile,
  history: Diff[],
  stars: Star[],
  tldrs: Tldr[],
  password: string | null
): Promise<SyncStatus> {
  try {
    const res = await fetch(`/api/profile/${profileId}/status`);
    if (!res.ok) {
      return { exists: true, error: 'Failed to check sync status' };
    }

    const status = (await res.json()) as {
      exists: boolean;
      diffs_hash?: string;
      stars_hash?: string;
      tldrs_hash?: string;
      keys_hash?: string;
      error?: string;
    };
    let localDiffsHash: string | null = null;
    let localStarsHash: string | null = null;
    let localTldrsHash: string | null = null;
    let localKeysHash: string | null = null;
    let needsSync = false;

    if (status.exists && profile.salt && password) {
      try {
        // Hash plaintext content for deterministic comparison
        localDiffsHash = await computeContentHash(history);
        localStarsHash = await computeStarsHash(stars);
        localTldrsHash = await computeTldrsHash(tldrs);
        localKeysHash = await computeKeysHash(profile.apiKeys, profile.providerSelections);

        needsSync = localDiffsHash !== status.diffs_hash ||
          localStarsHash !== status.stars_hash ||
          localTldrsHash !== status.tldrs_hash ||
          localKeysHash !== status.keys_hash;
      } catch (e) {
        console.error('Failed to compute local hashes:', e);
      }
    }

    return {
      ...status,
      localDiffsHash,
      localStarsHash,
      localTldrsHash,
      localKeysHash,
      needsSync,
      hasPassword: !!password
    };
  } catch (e) {
    console.error('Sync status check error:', e);
    return { exists: true, error: 'Network error' };
  }
}

/**
 * Share profile to server (first-time setup)
 */
export async function shareProfile(
  profileId: string,
  profile: Profile,
  password: string
): Promise<{ passwordSalt: string; salt: string }> {
  const anthropicKey = getAnthropicKey(profile);
  if (!anthropicKey) throw new Error('Profile missing API key');

  // Build expanded blob: apiKeys + providerSelections
  const apiKeysRecord = buildApiKeysRecord(profile.apiKeys);
  const blob: EncryptedKeysBlob = {
    apiKeys: apiKeysRecord,
    providerSelections: profile.providerSelections
  };

  const { encrypted, salt } = await encryptApiKeys(blob as unknown as Record<string, string>, password);
  const keysHash = await computeKeysHash(profile.apiKeys, profile.providerSelections);
  const existingPasswordSalt = profile.passwordSalt;
  const passwordHash = await hashPasswordForTransport(password, existingPasswordSalt);

  await postJson('/api/profile/create', {
    id: profileId,
    name: profile.name,
    password_hash: passwordHash,
    encrypted_api_key: encrypted,
    salt,
    keys_hash: keysHash,
    languages: profile.languages,
    frameworks: profile.frameworks,
    tools: profile.tools,
    topics: profile.topics,
    depth: profile.depth,
    custom_focus: profile.customFocus,
  });

  const passwordSalt = passwordHash.split(':')[0];
  return { passwordSalt, salt };
}

/**
 * Import a shared profile from server.
 * Pass `baseUrl` and `fetchFn` to use from CLI (absolute URLs + custom fetch).
 */
export async function importProfile(
  id: string,
  password: string,
  opts?: { baseUrl?: string; fetchFn?: typeof fetch }
): Promise<{ profile: Profile; diffs: Diff[]; stars: Star[]; tldrs: Tldr[] }> {
  const base = opts?.baseUrl ?? '';
  const fetcher = opts?.fetchFn;

  // First fetch the share info to get the password salt
  const shareData = await fetchJson<{ password_salt?: string }>(
    `${base}/api/share/${id}`, undefined, fetcher
  );

  if (!shareData.password_salt) {
    throw new Error('Profile is missing password data');
  }

  const passwordHash = await hashPasswordForTransport(password, shareData.password_salt);
  const data = await fetchJson<{
    id: string;
    name: string;
    encrypted_api_key: string;
    salt: string;
    languages?: string[];
    frameworks?: string[];
    tools?: string[];
    topics?: string[];
    depth?: GenerationDepth;
    custom_focus?: string;
  }>(`${base}/api/profile/${id}?password_hash=${encodeURIComponent(passwordHash)}`, undefined, fetcher);

  // Decrypt the blob (handles all legacy formats)
  const { apiKeys, providerSelections } = await decryptKeysBlob(data.encrypted_api_key, password, data.salt);

  const profile: Profile = {
    id: data.id,
    name: data.name,
    apiKeys,
    providerSelections,
    salt: data.salt,
    passwordSalt: shareData.password_salt,
    languages: data.languages || [],
    frameworks: data.frameworks || [],
    tools: data.tools || [],
    topics: data.topics || [],
    depth: (data.depth as GenerationDepth) || 'standard',
    customFocus: data.custom_focus || '',
    syncedAt: new Date().toISOString(),
  };

  return { profile, diffs: [], stars: [], tldrs: [] };
}

/**
 * Upload local content to server
 * Uses selective upload when server state matches our last-synced state
 */
export async function uploadContent(
  profileId: string,
  profile: Profile,
  history: Diff[],
  stars: Star[],
  tldrs: Tldr[],
  pending: PendingChanges,
  password: string
): Promise<{ uploaded: number; diffsHash: string; starsHash: string; tldrsHash: string; keysHash?: string }> {
  const salt = profile.salt;
  if (!salt) throw new Error('Profile missing encryption salt');

  const passwordSalt = profile.passwordSalt;
  if (!passwordSalt) {
    throw new Error('Profile missing password salt - try re-sharing the profile');
  }

  const passwordHash = await hashPasswordForTransport(password, passwordSalt);

  // Check if we can do selective upload (server unchanged since our last sync)
  // Fetch current server status to compare hashes
  let useSelectiveUpload = false;
  try {
    const statusRes = await fetch(`/api/profile/${profileId}/status`);
    if (statusRes.ok) {
      const status = (await statusRes.json()) as { diffs_hash?: string; stars_hash?: string; tldrs_hash?: string };
      // If server hashes match our stored hashes, server hasn't changed
      // We can safely upload only modified items
      const serverDiffsMatch = status.diffs_hash === profile.diffsHash;
      const serverStarsMatch = status.stars_hash === profile.starsHash;
      const serverTldrsMatch = status.tldrs_hash === profile.tldrsHash;
      useSelectiveUpload = serverDiffsMatch && serverStarsMatch && serverTldrsMatch;
    }
  } catch {
    // On error, fall back to full upload
  }

  // Encrypt diffs: selective (only modified) or full (all)
  const modifiedDiffIds = useSelectiveUpload ? new Set(pending.modifiedDiffs) : null;
  const diffsToUpload = await encryptDiffs(history, modifiedDiffIds, password, salt);

  // Upload stars: selective (only modified) or full (all)
  const modifiedStarIds = useSelectiveUpload ? new Set(pending.modifiedStars) : null;
  const starsToUpload = await encryptStars(stars, modifiedStarIds, password, salt);

  // Upload TLDRs: selective (only modified) or full (all)
  const modifiedTldrIds = useSelectiveUpload ? new Set(pending.modifiedTldrs) : null;
  const tldrsToUpload = await encryptTldrs(tldrs, modifiedTldrIds, password, salt);

  // Compute hashes over plaintext content for deterministic comparison
  const diffsHash = await computeContentHash(history);
  const starsHash = await computeStarsHash(stars);
  const tldrsHash = await computeTldrsHash(tldrs);

  // Include profile data if modified
  const profileData = pending.profileModified ? buildProfileMetadata(profile) : undefined;

  // Re-encrypt and include keys blob if keys/providers changed
  let encryptedApiKey: string | undefined;
  let keysHash: string | undefined;
  if (pending.keysModified) {
    const apiKeysRecord = buildApiKeysRecord(profile.apiKeys);
    const blob: EncryptedKeysBlob = {
      apiKeys: apiKeysRecord,
      providerSelections: profile.providerSelections
    };
    encryptedApiKey = await encryptData(blob, password, salt);
    keysHash = await computeKeysHash(profile.apiKeys, profile.providerSelections);
  }

  await postJson(`/api/profile/${profileId}/sync`, buildSyncPayload({
    passwordHash,
    diffs: diffsToUpload,
    deletedDiffIds: pending.deletedDiffs.map(d => d.id),
    diffsHash,
    starsHash,
    tldrsHash,
    stars: starsToUpload,
    deletedStarIds: pending.deletedStars.map(d => d.id),
    tldrs: tldrsToUpload,
    deletedTldrIds: pending.deletedTldrs.map(d => d.id),
    encryptedApiKey,
    keysHash,
    profile: profileData
  }));

  const uploaded = pending.modifiedDiffs.length + pending.modifiedStars.length +
    pending.modifiedTldrs.length +
    pending.deletedDiffs.length + pending.deletedStars.length +
    pending.deletedTldrs.length;

  return { uploaded, diffsHash, starsHash, tldrsHash, keysHash };
}

/**
 * Download content from server and return merged data
 * Pass local hashes to skip fetching collections that haven't changed
 */
export async function downloadContent(
  profileId: string,
  profile: Profile,
  localHistory: Diff[],
  localStars: Star[],
  localTldrs: Tldr[],
  pending: PendingChanges,
  password: string,
  localDiffsHash?: string,
  localStarsHash?: string,
  localTldrsHash?: string
): Promise<{
  downloaded: number;
  diffs: Diff[];
  stars: Star[];
  tldrs: Tldr[];
  diffsHash: string;
  starsHash: string;
  tldrsHash: string;
  keysHash?: string;
  profileUpdates?: Partial<Profile>;
  remainingPending: PendingChanges;
  salt: string;
  decryptionErrors: number;
}> {
  const passwordSalt = profile.passwordSalt;
  if (!passwordSalt) {
    throw new Error('Profile missing password salt - try re-importing the profile');
  }

  const passwordHash = await hashPasswordForTransport(password, passwordSalt);

  const localKeysHash = profile.keysHash;

  const data = await postJson<{
    salt?: string;
    diffs: { id: string; encrypted_data: string }[];
    stars: { id: string; encrypted_data: string }[];
    tldrs: { id: string; encrypted_data: string }[];
    diffs_skipped?: boolean;
    stars_skipped?: boolean;
    tldrs_skipped?: boolean;
    encrypted_api_key?: string;
    keys_skipped?: boolean;
    profile?: {
      name: string;
      languages: string[];
      frameworks: string[];
      tools: string[];
      topics: string[];
      depth: GenerationDepth;
      custom_focus: string;
    };
  }>(`/api/profile/${profileId}/content`, {
    password_hash: passwordHash,
    diffs_hash: localDiffsHash,
    stars_hash: localStarsHash,
    tldrs_hash: localTldrsHash,
    keys_hash: localKeysHash
  });

  const salt = data.salt || profile.salt!;
  let totalDownloaded = 0;
  let totalErrors = 0;

  // Build profile updates (skip if local profile changes pending)
  const hasLocalProfileChanges = pending.profileModified;
  let profileUpdates: Partial<Profile> | undefined;

  if (data.profile && !hasLocalProfileChanges) {
    profileUpdates = {
      name: data.profile.name,
      languages: data.profile.languages,
      frameworks: data.profile.frameworks,
      tools: data.profile.tools,
      topics: data.profile.topics,
      depth: data.profile.depth as GenerationDepth,
      customFocus: data.profile.custom_focus,
    };
  }

  // Decrypt and merge keys blob if server returned one and no local key changes pending
  let keysNeedReupload = false;
  if (data.encrypted_api_key && !pending.keysModified) {
    try {
      const result = await decryptKeysBlob(data.encrypted_api_key, password, salt);
      if (!profileUpdates) profileUpdates = {};
      // Merge: server keys fill gaps, local keys take precedence
      const merged = { ...result.apiKeys, ...profile.apiKeys } as ApiKeys;
      // Remove empty values
      for (const [k, v] of Object.entries(merged)) {
        if (!v) delete (merged as Record<string, unknown>)[k];
      }
      profileUpdates.apiKeys = merged;
      profileUpdates.providerSelections = {
        ...result.providerSelections,
        ...profile.providerSelections
      };
      // If local has keys the server doesn't, flag for re-upload
      const serverKeyCount = Object.keys(result.apiKeys).filter(k => result.apiKeys[k]).length;
      const mergedKeyCount = Object.keys(merged).filter(k => merged[k as keyof ApiKeys]).length;
      if (mergedKeyCount > serverKeyCount) {
        keysNeedReupload = true;
      }
    } catch (e) {
      console.error('Failed to decrypt keys blob:', e);
    }
  }

  // Decrypt and merge diffs (skip if server indicated no changes)
  let filteredHistory = [...localHistory];
  let remainingDeletedDiffs = pending.deletedDiffs;
  if (!data.diffs_skipped) {
    const diffResult = await decryptAndMergeDiffs(data.diffs, localHistory, pending, password, salt);
    filteredHistory = diffResult.merged;
    remainingDeletedDiffs = diffResult.remainingDeletions;
    totalDownloaded += diffResult.downloaded;
    totalErrors += diffResult.errors;
    if (diffResult.errors > 0) {
      console.error(`Failed to decrypt ${diffResult.errors} diff(s)`);
    }
  }

  // Decrypt and merge stars (skip if server indicated no changes)
  let filteredStars = [...localStars];
  let remainingDeletedStars = pending.deletedStars;
  if (!data.stars_skipped) {
    console.warn(`[Sync] Star merge starting: ${localStars.length} local, ${data.stars.length} from server, ${pending.modifiedStars.length} pending modified, ${pending.deletedStars.length} pending deleted`);
    const starResult = await decryptAndMergeStars(data.stars, localStars, pending, password, salt);
    filteredStars = starResult.merged;
    remainingDeletedStars = starResult.remainingDeletions;
    totalDownloaded += starResult.downloaded;
    totalErrors += starResult.errors;
    if (starResult.errors > 0) {
      console.error(`Failed to decrypt ${starResult.errors} star(s)`);
    }
  }

  // Decrypt and merge TLDRs (skip if server indicated no changes)
  let filteredTldrs = [...localTldrs];
  let remainingDeletedTldrs = pending.deletedTldrs;
  if (!data.tldrs_skipped) {
    const tldrResult = await decryptAndMergeTldrs(data.tldrs || [], localTldrs, pending, password, salt);
    filteredTldrs = tldrResult.merged;
    remainingDeletedTldrs = tldrResult.remainingDeletions;
    totalDownloaded += tldrResult.downloaded;
    totalErrors += tldrResult.errors;
    if (tldrResult.errors > 0) {
      console.error(`Failed to decrypt ${tldrResult.errors} tldr(s)`);
    }
  }

  // When a diff was deleted server-side, its cascaded TLDRs are also gone — drop
  // local TLDRs that reference a diff no longer present.
  const finalDiffIds = new Set(filteredHistory.map(d => d.id));
  filteredTldrs = filteredTldrs.filter(t => finalDiffIds.has(t.diff_id));

  // Sort history by date (newest first)
  sortDiffsNewestFirst(filteredHistory);

  // Compute hashes over plaintext content for deterministic comparison
  const diffsHash = await computeContentHash(filteredHistory);
  const starsHash = await computeStarsHash(filteredStars);
  const tldrsHash = await computeTldrsHash(filteredTldrs);

  // Compute keys hash from the final state (after potential merge from server)
  const finalApiKeys = profileUpdates?.apiKeys || profile.apiKeys;
  const finalProviderSelections = profileUpdates?.providerSelections || profile.providerSelections;
  const keysHash = await computeKeysHash(finalApiKeys, finalProviderSelections);

  // Keep all pending modifications - they still need to be uploaded even if server has the item
  // (e.g., local changes like isPublic flag need to be pushed to server)
  // Deletions are filtered by the merge reconciliation (stale tombstones dropped).
  const remainingPending: PendingChanges = {
    modifiedDiffs: [...pending.modifiedDiffs],
    modifiedStars: [...pending.modifiedStars],
    modifiedTldrs: [...pending.modifiedTldrs],
    deletedDiffs: remainingDeletedDiffs,
    deletedStars: remainingDeletedStars,
    deletedTldrs: remainingDeletedTldrs,
    profileModified: hasLocalProfileChanges,
    keysModified: pending.keysModified || keysNeedReupload
  };

  return {
    downloaded: totalDownloaded,
    diffs: filteredHistory,
    stars: filteredStars,
    tldrs: filteredTldrs,
    diffsHash,
    starsHash,
    tldrsHash,
    keysHash,
    salt,
    decryptionErrors: totalErrors,
    profileUpdates,
    remainingPending
  };
}

/**
 * Update sync password - re-encrypts all data with new password
 */
export async function updatePassword(
  profileId: string,
  profile: Profile,
  history: Diff[],
  stars: Star[],
  tldrs: Tldr[],
  oldPassword: string,
  newPassword: string
): Promise<{ passwordSalt: string; salt: string }> {
  const anthropicKey = getAnthropicKey(profile);
  if (!anthropicKey) throw new Error('Profile missing API key');
  if (!profile.passwordSalt) throw new Error('Profile missing password salt');
  if (!profile.salt) throw new Error('Profile missing encryption salt');

  // Generate new encryption salt
  const newSaltBytes = crypto.getRandomValues(new Uint8Array(16));
  const newSalt = uint8ToBase64(newSaltBytes);

  // Hash old password with existing salt for verification
  const oldPasswordHash = await hashPasswordForTransport(oldPassword, profile.passwordSalt);

  // Hash new password (generates new password salt)
  const newPasswordHash = await hashPasswordForTransport(newPassword);
  const newPasswordSalt = newPasswordHash.split(':')[0];

  // Re-encrypt API keys + provider selections with new password + new salt
  const apiKeysRecord = buildApiKeysRecord(profile.apiKeys);
  const blob: EncryptedKeysBlob = {
    apiKeys: apiKeysRecord,
    providerSelections: profile.providerSelections
  };
  const newEncryptedApiKey = await encryptData(blob, newPassword, newSalt);

  // Re-encrypt all diffs with new password + new salt
  const encryptedDiffs: { id: string; encrypted_data: string }[] = [];
  for (const diff of history) {
    const encrypted = await encryptData(diff, newPassword, newSalt);
    encryptedDiffs.push({ id: diff.id, encrypted_data: encrypted });
  }

  // Re-encrypt all stars with new password + new salt
  const encryptedStars: { id: string; encrypted_data: string }[] = [];
  for (const star of stars) {
    const encrypted = await encryptData(star, newPassword, newSalt);
    encryptedStars.push({ id: starId(star), encrypted_data: encrypted });
  }

  // Re-encrypt all TLDRs with new password + new salt
  const encryptedTldrs: { id: string; encrypted_data: string }[] = [];
  for (const tldr of tldrs) {
    const encrypted = await encryptData(tldr, newPassword, newSalt);
    encryptedTldrs.push({ id: tldrId(tldr), encrypted_data: encrypted });
  }

  // POST to server
  await postJson(`/api/profile/${profileId}/password`, {
    old_password_hash: oldPasswordHash,
    new_password_hash: newPasswordHash,
    new_encrypted_api_key: newEncryptedApiKey,
    new_salt: newSalt,
    diffs: encryptedDiffs,
    stars: encryptedStars,
    tldrs: encryptedTldrs
  });

  return { passwordSalt: newPasswordSalt, salt: newSalt };
}

/**
 * Delete a profile from the server (removes all synced data)
 */
export async function deleteProfileFromServer(
  profileId: string,
  password: string,
  passwordSalt: string
): Promise<void> {
  const passwordHash = await hashPasswordForTransport(password, passwordSalt);
  await fetchJson(`/api/profile/${profileId}?password_hash=${encodeURIComponent(passwordHash)}`, {
    method: 'DELETE'
  });
}
