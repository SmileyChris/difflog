import {
  encryptApiKeys,
  encryptApiKeysWithSalt,
  decryptApiKeys,
  hashPasswordForTransport,
  encryptData,
  decryptData,
  computeContentHash,
  uint8ToBase64
} from './crypto';
import { completeJson } from './llm';
import { DEPTH_TOKEN_LIMITS, type GenerationDepth } from './constants';
import { fetchJson, postJson } from './api';
import { STORAGE_KEYS } from './constants';

// Types
export interface PendingChanges {
  modifiedDiffs: string[];
  modifiedStars: string[];
  deletedDiffs: string[];
  deletedStars: string[];
  profileModified?: boolean;
  keysModified?: boolean;
}

export interface SyncStatus {
  exists: boolean;
  diffs_hash?: string;
  stars_hash?: string;
  keys_hash?: string;
  content_updated_at?: string;
  error?: string;
  localDiffsHash?: string | null;
  localStarsHash?: string | null;
  localKeysHash?: string | null;
  needsSync?: boolean;
  hasPassword?: boolean;
}

export interface SyncResult {
  uploaded: number;
  downloaded: number;
  status: 'synced' | 'uploaded' | 'downloaded';
}

export interface ResolvedMapping {
  subreddits: string[];
  lobstersTags: string[];
  devtoTags: string[];
}

export interface ApiKeys {
  anthropic?: string;
  serper?: string;
  perplexity?: string;
  deepseek?: string;
  gemini?: string;
}

export interface ProviderSelections {
  search?: string | null;
  curation?: string | null;
  synthesis?: string | null;
}

/** Shape of the expanded encrypted blob (apiKeys + providerSelections) */
export interface EncryptedKeysBlob {
  apiKeys: Record<string, string>;
  providerSelections?: ProviderSelections;
}

/**
 * Compute a deterministic hash over API keys and provider selections
 */
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

/**
 * Build the filtered apiKeys record (non-empty values only) for encryption
 */
function buildApiKeysRecord(apiKeys?: ApiKeys): Record<string, string> {
  const record: Record<string, string> = {};
  if (apiKeys) {
    Object.entries(apiKeys).forEach(([key, value]) => {
      if (value) record[key] = value;
    });
  }
  return record;
}

/**
 * Infer provider selections from available API keys (legacy fallback)
 */
function inferProviderSelections(apiKeys: Record<string, string>): ProviderSelections {
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

/**
 * Get Anthropic API key from profile
 */
export function getAnthropicKey(profile: { apiKeys?: ApiKeys }): string | undefined {
  return profile.apiKeys?.anthropic;
}

export interface Profile {
  id: string;
  name: string;
  apiKeys?: ApiKeys;
  providerSelections?: ProviderSelections;
  salt?: string;
  passwordSalt?: string;
  syncedAt?: string | null;
  createdAt?: string;
  languages?: string[];
  frameworks?: string[];
  tools?: string[];
  topics?: string[];
  depth: GenerationDepth;
  customFocus: string;
  resolvedMappings?: Record<string, ResolvedMapping>;
  [key: string]: unknown;
}

export interface Diff {
  id: string;
  content: string;
  generated_at: string;
  title?: string;
  duration_seconds?: number;
  cost?: number;
  isPublic?: boolean;
  window_days?: number;
  [key: string]: unknown;
}

export interface Star {
  diff_id: string;
  p_index: number;
  added_at: string;
  [key: string]: unknown;
}

// Compute deterministic star ID from its semantic identity
export function starId(star: Star): string;
export function starId(diffId: string, pIndex: number): string;
export function starId(starOrDiffId: Star | string, pIndex?: number): string {
  if (typeof starOrDiffId === 'string') {
    return `${starOrDiffId}:${pIndex}`;
  }
  return `${starOrDiffId.diff_id}:${starOrDiffId.p_index}`;
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
    deletedDiffs: [],
    deletedStars: [],
    profileModified: false,
    keysModified: false
  };
}

/** Configuration for change tracking by type and action */
const CHANGE_HANDLERS = {
  diff: {
    modified: { addTo: 'modifiedDiffs', removeFrom: 'deletedDiffs' },
    deleted: { addTo: 'deletedDiffs', removeFrom: 'modifiedDiffs' }
  },
  star: {
    modified: { addTo: 'modifiedStars', removeFrom: 'deletedStars' },
    deleted: { addTo: 'deletedStars', removeFrom: 'modifiedStars' }
  }
} as const;

type ArrayKeys = 'modifiedDiffs' | 'modifiedStars' | 'deletedDiffs' | 'deletedStars';

export function trackChange(
  pending: PendingChanges,
  type: 'diff' | 'star',
  action: 'modified' | 'deleted',
  id: string
): PendingChanges {
  const { addTo, removeFrom } = CHANGE_HANDLERS[type][action];
  const result = { ...pending };

  // Remove from opposite list (e.g., remove from deleted when modifying)
  result[removeFrom as ArrayKeys] = result[removeFrom as ArrayKeys].filter(i => i !== id);

  // Add to target list if not already present
  if (!result[addTo as ArrayKeys].includes(id)) {
    result[addTo as ArrayKeys] = [...result[addTo as ArrayKeys], id];
  }

  return result;
}

export function hasPendingChanges(pending: PendingChanges | null): boolean {
  if (!pending) return false;
  return pending.profileModified ||
    pending.keysModified ||
    pending.modifiedDiffs.length > 0 ||
    pending.modifiedStars.length > 0 ||
    pending.deletedDiffs.length > 0 ||
    pending.deletedStars.length > 0;
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
  password: string | null
): Promise<SyncStatus> {
  try {
    const res = await fetch(`/api/profile/${profileId}/status`);
    if (!res.ok) {
      return { exists: false, error: 'Failed to check sync status' };
    }

    const status = (await res.json()) as {
      exists: boolean;
      diffs_hash?: string;
      stars_hash?: string;
      keys_hash?: string;
      error?: string;
    };
    let localDiffsHash: string | null = null;
    let localStarsHash: string | null = null;
    let localKeysHash: string | null = null;
    let needsSync = false;

    if (status.exists && profile.salt && password) {
      try {
        // Hash plaintext content for deterministic comparison
        localDiffsHash = await computeContentHash(history);
        // Map stars to temporary objects with ID for hashing
        const starsWithIds = stars.map(s => ({ ...s, id: starId(s) }));
        localStarsHash = await computeContentHash(starsWithIds);
        localKeysHash = await computeKeysHash(profile.apiKeys, profile.providerSelections);

        needsSync = localDiffsHash !== status.diffs_hash ||
          localStarsHash !== status.stars_hash ||
          localKeysHash !== status.keys_hash;
      } catch (e) {
        console.error('Failed to compute local hashes:', e);
      }
    }

    return {
      ...status,
      localDiffsHash,
      localStarsHash,
      localKeysHash,
      needsSync,
      hasPassword: !!password
    };
  } catch (e) {
    console.error('Sync status check error:', e);
    return { exists: false, error: 'Network error' };
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
 * Import a shared profile from server
 */
export async function importProfile(
  id: string,
  password: string
): Promise<{ profile: Profile; diffs: Diff[]; stars: Star[] }> {
  // First fetch the share info to get the password salt
  const shareData = await fetchJson<{ password_salt?: string }>(`/api/share/${id}`);

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
  }>(`/api/profile/${id}?password_hash=${encodeURIComponent(passwordHash)}`);

  // Decrypt the blob — try expanded format first, fall back to legacy
  let apiKeys: Record<string, string>;
  let providerSelections: ProviderSelections = {};

  try {
    const decrypted = await decryptData<EncryptedKeysBlob | Record<string, string>>(
      data.encrypted_api_key, password, data.salt
    );

    if (decrypted && typeof decrypted === 'object' && 'apiKeys' in decrypted) {
      // New expanded format: { apiKeys, providerSelections }
      const blob = decrypted as EncryptedKeysBlob;
      apiKeys = blob.apiKeys;
      providerSelections = blob.providerSelections || {};
    } else {
      // Legacy format: Record<string, string> (just API keys)
      apiKeys = decrypted as Record<string, string>;
      providerSelections = inferProviderSelections(apiKeys);
    }
  } catch {
    // Fallback: try decryptApiKeys which handles single-key format too
    apiKeys = await decryptApiKeys(data.encrypted_api_key, data.salt, password);
    providerSelections = inferProviderSelections(apiKeys);
  }

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

  return { profile, diffs: [], stars: [] };
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
  pending: PendingChanges,
  password: string
): Promise<{ uploaded: number; diffsHash: string; starsHash: string; keysHash?: string }> {
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
      const status = (await statusRes.json()) as { diffs_hash?: string; stars_hash?: string };
      // If server hashes match our stored hashes, server hasn't changed
      // We can safely upload only modified items
      const serverDiffsMatch = status.diffs_hash === profile.diffsHash;
      const serverStarsMatch = status.stars_hash === profile.starsHash;
      useSelectiveUpload = serverDiffsMatch && serverStarsMatch;
    }
  } catch {
    // On error, fall back to full upload
  }

  // Determine which items to upload
  const modifiedDiffIds = new Set(pending.modifiedDiffs);
  const modifiedStarIds = new Set(pending.modifiedStars);

  // Upload diffs: selective (only modified) or full (all)
  const diffsToUpload: { id: string; encrypted_data: string }[] = [];
  for (const diff of history) {
    // Skip unmodified diffs if using selective upload
    if (useSelectiveUpload && !modifiedDiffIds.has(diff.id)) {
      continue;
    }

    if (diff.isPublic) {
      // Public diffs are stored as plaintext JSON
      const { isPublic, ...diffData } = diff;
      diffsToUpload.push({
        id: diff.id,
        encrypted_data: JSON.stringify(diffData)
      });
    } else {
      // Private diffs are encrypted
      const encrypted = await encryptData(diff, password, salt);
      diffsToUpload.push({ id: diff.id, encrypted_data: encrypted });
    }
  }

  // Upload stars: selective (only modified) or full (all)
  const starsToUpload: { id: string; encrypted_data: string }[] = [];
  for (const star of stars) {
    const id = starId(star);
    // Skip unmodified stars if using selective upload
    if (useSelectiveUpload && !modifiedStarIds.has(id)) {
      continue;
    }

    const encrypted = await encryptData(star, password, salt);
    starsToUpload.push({ id, encrypted_data: encrypted });
  }

  // Compute hashes over plaintext content for deterministic comparison
  const diffsHash = await computeContentHash(history);
  // Map stars to temporary objects with ID for hashing
  const starsWithIds = stars.map(s => ({ ...s, id: starId(s) }));
  const starsHash = await computeContentHash(starsWithIds);

  // Include profile data if modified
  const profileData = pending.profileModified ? {
    name: profile.name,
    languages: profile.languages,
    frameworks: profile.frameworks,
    tools: profile.tools,
    topics: profile.topics,
    depth: profile.depth,
    custom_focus: profile.customFocus,
  } : undefined;

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

  await postJson(`/api/profile/${profileId}/sync`, {
    password_hash: passwordHash,
    diffs: diffsToUpload,
    stars: starsToUpload,
    deleted_diff_ids: pending.deletedDiffs,
    deleted_star_ids: pending.deletedStars,
    diffs_hash: diffsHash,
    stars_hash: starsHash,
    encrypted_api_key: encryptedApiKey,
    keys_hash: keysHash,
    profile: profileData,
  });

  const uploaded = pending.modifiedDiffs.length + pending.modifiedStars.length +
    pending.deletedDiffs.length + pending.deletedStars.length;

  return { uploaded, diffsHash, starsHash, keysHash };
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
  pending: PendingChanges,
  password: string,
  localDiffsHash?: string,
  localStarsHash?: string
): Promise<{
  downloaded: number;
  diffs: Diff[];
  stars: Star[];
  diffsHash: string;
  starsHash: string;
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
    diffs_skipped?: boolean;
    stars_skipped?: boolean;
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
    keys_hash: localKeysHash
  });

  const salt = data.salt || profile.salt!;
  let downloaded = 0;
  let decryptionErrors = 0;

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
  if (data.encrypted_api_key && !pending.keysModified) {
    try {
      const decrypted = await decryptData<EncryptedKeysBlob | Record<string, string>>(
        data.encrypted_api_key, password, salt
      );
      if (!profileUpdates) profileUpdates = {};
      if (decrypted && typeof decrypted === 'object' && 'apiKeys' in decrypted) {
        const blob = decrypted as EncryptedKeysBlob;
        profileUpdates.apiKeys = blob.apiKeys as ApiKeys;
        profileUpdates.providerSelections = blob.providerSelections;
      } else {
        // Legacy format
        profileUpdates.apiKeys = decrypted as ApiKeys;
        profileUpdates.providerSelections = inferProviderSelections(decrypted as Record<string, string>);
      }
    } catch (e) {
      console.error('Failed to decrypt keys blob:', e);
    }
  }

  // Get pending deletions so we don't re-add items we're about to delete
  const pendingDeletedDiffs = new Set(pending.deletedDiffs);
  const pendingDeletedStars = new Set(pending.deletedStars);
  const pendingModifiedDiffs = new Set(pending.modifiedDiffs);
  const pendingModifiedStars = new Set(pending.modifiedStars);

  // Decrypt and merge diffs (skip if server indicated no changes)
  const serverDiffIds = new Set<string>();
  let mergedHistory = [...localHistory];

  if (!data.diffs_skipped) {
    for (const encryptedDiff of data.diffs) {
      try {
        let diff: Diff;
        // Public diffs are plaintext JSON (starts with '{'), private are encrypted base64
        if (encryptedDiff.encrypted_data.startsWith('{')) {
          diff = JSON.parse(encryptedDiff.encrypted_data) as Diff;
          diff.isPublic = true;
        } else {
          diff = await decryptData(encryptedDiff.encrypted_data, password, salt) as Diff;
          diff.isPublic = false;
        }
        serverDiffIds.add(encryptedDiff.id);

        const existingIdx = mergedHistory.findIndex(d => d.id === encryptedDiff.id);
        if (existingIdx === -1 && !pendingDeletedDiffs.has(encryptedDiff.id)) {
          mergedHistory.push(diff);
          downloaded++;
        } else if (existingIdx !== -1 && !pendingModifiedDiffs.has(encryptedDiff.id)) {
          // Update isPublic from server if not locally modified
          mergedHistory[existingIdx].isPublic = diff.isPublic;
        }
      } catch (e) {
        console.error('Failed to decrypt diff:', e);
        decryptionErrors++;
      }
    }

    // Remove diffs deleted on server (only when we fetched server state)
    mergedHistory = mergedHistory.filter(d =>
      serverDiffIds.has(d.id) || pendingDeletedDiffs.has(d.id) || pendingModifiedDiffs.has(d.id)
    );
  }

  // Decrypt and merge stars (skip if server indicated no changes)
  const serverStarIds = new Set<string>();
  let mergedStars = [...localStars];

  if (!data.stars_skipped) {
    for (const encryptedStar of data.stars) {
      try {
        const star = await decryptData(encryptedStar.encrypted_data, password, salt) as Star;
        serverStarIds.add(encryptedStar.id);

        const existingIdx = mergedStars.findIndex(s => starId(s) === encryptedStar.id);
        if (existingIdx === -1 && !pendingDeletedStars.has(encryptedStar.id)) {
          mergedStars.push(star);
          downloaded++;
        }
      } catch (e) {
        console.error('Failed to decrypt star:', e);
        decryptionErrors++;
      }
    }

    // Remove stars deleted on server (only when we fetched server state)
    mergedStars = mergedStars.filter(s => {
      const id = starId(s);
      return serverStarIds.has(id) || pendingDeletedStars.has(id) || pendingModifiedStars.has(id);
    });
  }

  const filteredHistory = mergedHistory;
  const filteredStars = mergedStars;

  // Sort history by date (newest first)
  filteredHistory.sort((a, b) =>
    new Date(b.generated_at).getTime() - new Date(a.generated_at).getTime()
  );

  // Compute hashes over plaintext content for deterministic comparison
  const diffsHash = await computeContentHash(filteredHistory);
  // Map stars to temporary objects with ID for hashing
  const starsWithIds = filteredStars.map(s => ({ ...s, id: starId(s) }));
  const starsHash = await computeContentHash(starsWithIds);

  // Compute keys hash from the final state (after potential merge from server)
  const finalApiKeys = profileUpdates?.apiKeys || profile.apiKeys;
  const finalProviderSelections = profileUpdates?.providerSelections || profile.providerSelections;
  const keysHash = await computeKeysHash(finalApiKeys, finalProviderSelections);

  // Keep all pending modifications - they still need to be uploaded even if server has the item
  // (e.g., local changes like isPublic flag need to be pushed to server)
  const remainingPending: PendingChanges = {
    modifiedDiffs: [...pending.modifiedDiffs],
    modifiedStars: [...pending.modifiedStars],
    deletedDiffs: pending.deletedDiffs,
    deletedStars: pending.deletedStars,
    profileModified: hasLocalProfileChanges,
    keysModified: pending.keysModified
  };

  return {
    downloaded,
    diffs: filteredHistory,
    stars: filteredStars,
    diffsHash,
    starsHash,
    keysHash,
    salt,
    decryptionErrors,
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

  // POST to server
  await postJson(`/api/profile/${profileId}/password`, {
    old_password_hash: oldPasswordHash,
    new_password_hash: newPasswordHash,
    new_encrypted_api_key: newEncryptedApiKey,
    new_salt: newSalt,
    diffs: encryptedDiffs,
    stars: encryptedStars
  });

  return { passwordSalt: newPasswordSalt, salt: newSalt };
}
