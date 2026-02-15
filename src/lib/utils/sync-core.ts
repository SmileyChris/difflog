/**
 * Pure data-transform functions shared by both web (lib/utils/sync.ts) and CLI (cli/sync.ts).
 * No I/O — no fetch, no storage, no DOM.
 */
import { encryptData, decryptData, uint8ToBase64 } from './crypto';
import type {
  Diff,
  PendingChanges,
  EncryptedKeysBlob,
  ProviderSelections,
  ApiKeys,
  ProfileCore,
  Star
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

/** Decrypt server diffs (public/private detection), merge with local respecting pending changes. */
export async function decryptAndMergeDiffs(
  serverDiffs: { id: string; encrypted_data: string }[],
  localDiffs: Diff[],
  pending: PendingChanges,
  password: string,
  salt: string
): Promise<{ merged: Diff[]; downloaded: number; errors: number }> {
  const pendingDeletedDiffs = new Set(pending.deletedDiffs);
  const pendingModifiedDiffs = new Set(pending.modifiedDiffs);
  const serverDiffIds = new Set<string>();
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

      const existingIdx = merged.findIndex(d => d.id === encryptedDiff.id);
      if (existingIdx === -1 && !pendingDeletedDiffs.has(encryptedDiff.id)) {
        merged.push(diff);
        downloaded++;
      } else if (existingIdx !== -1 && !pendingModifiedDiffs.has(encryptedDiff.id)) {
        // Server wins for non-locally-modified diffs (update isPublic at minimum)
        merged[existingIdx] = { ...merged[existingIdx], isPublic: diff.isPublic };
      }
    } catch {
      errors++;
    }
  }

  // Remove diffs deleted on server (unless locally modified or pending delete)
  merged = merged.filter(d =>
    serverDiffIds.has(d.id) || pendingDeletedDiffs.has(d.id) || pendingModifiedDiffs.has(d.id)
  );

  return { merged, downloaded, errors };
}

/** Decrypt server stars, merge with local respecting pending changes. */
export async function decryptAndMergeStars(
  serverStars: { id: string; encrypted_data: string }[],
  localStars: Star[],
  pending: PendingChanges,
  password: string,
  salt: string
): Promise<{ merged: Star[]; downloaded: number; errors: number }> {
  const pendingDeletedStars = new Set(pending.deletedStars);
  const pendingModifiedStars = new Set(pending.modifiedStars);
  const serverStarIds = new Set<string>();
  let merged = [...localStars];
  let downloaded = 0;
  let errors = 0;

  for (const encryptedStar of serverStars) {
    try {
      const star = await decryptData(encryptedStar.encrypted_data, password, salt) as Star;
      serverStarIds.add(encryptedStar.id);

      const existingIdx = merged.findIndex(s => starId(s) === encryptedStar.id);
      if (existingIdx === -1 && !pendingDeletedStars.has(encryptedStar.id)) {
        merged.push(star);
        downloaded++;
      }
    } catch {
      errors++;
    }
  }

  // Remove stars deleted on server
  merged = merged.filter(s => {
    const id = starId(s);
    return serverStarIds.has(id) || pendingDeletedStars.has(id) || pendingModifiedStars.has(id);
  });

  return { merged, downloaded, errors };
}

/** Decrypt an encrypted keys blob, handling both new and legacy formats. */
export async function decryptKeysBlob(
  encryptedApiKey: string,
  password: string,
  salt: string
): Promise<{ apiKeys: Record<string, string>; providerSelections: ProviderSelections }> {
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

  // Legacy format: Record<string, string> (just API keys)
  const apiKeys = decrypted as Record<string, string>;
  return {
    apiKeys,
    providerSelections: inferProviderSelections(apiKeys)
  };
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
  stars?: { id: string; encrypted_data: string }[];
  deletedStarIds?: string[];
  encryptedApiKey?: string;
  keysHash?: string;
  profile?: ReturnType<typeof buildProfileMetadata>;
}): Record<string, unknown> {
  return {
    password_hash: opts.passwordHash,
    diffs: opts.diffs,
    stars: opts.stars || [],
    deleted_diff_ids: opts.deletedDiffIds,
    deleted_star_ids: opts.deletedStarIds || [],
    diffs_hash: opts.diffsHash,
    stars_hash: opts.starsHash,
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
