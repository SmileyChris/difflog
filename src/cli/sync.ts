import { getSession, getProfile, getDiffs, saveDiffs, saveProfile, getPendingChanges, clearPendingChanges, getSyncMeta, saveSyncMeta, getApiKeys } from './config';
import type { Session, Profile, Diff, PendingChanges, SyncMeta } from './config';
import { cliFetchJson, BASE } from './api';
import { encryptData, hashPasswordForTransport, computeContentHash } from '../lib/utils/crypto';
import type { ProviderSelections, ApiKeys, EncryptedKeysBlob } from '../lib/types/sync';
import {
	encryptDiffs,
	decryptAndMergeDiffs,
	decryptKeysBlob,
	buildProfileMetadata,
	buildSyncPayload,
	sortDiffsNewestFirst,
	computeKeysHash
} from '../lib/utils/sync-core';
import { setPassword } from 'cross-keychain';
import { SERVICE_NAME } from './ui';

/** Check if the current session has the credentials needed for sync */
export function canSync(): boolean {
	const session = getSession();
	if (!session) return false;
	return !!(session.password && session.passwordSalt && session.salt);
}

/** Silent upload helper — no-ops if sync isn't available */
export async function syncUpload(): Promise<void> {
	const session = getSession();
	if (session && canSync()) {
		try { await upload(session); } catch { /* silent */ }
	}
}

/** Upload pending local changes to the server */
export async function upload(session: Session): Promise<number> {
	const profile = getProfile();
	if (!profile) return 0;

	const pending = getPendingChanges();
	const hasPending = pending.profileModified || pending.keysModified ||
		pending.modifiedDiffs.length > 0 || pending.deletedDiffs.length > 0;
	if (!hasPending) return 0;

	const passwordHash = await hashPasswordForTransport(session.password, session.passwordSalt);
	const diffs = getDiffs();

	// Encrypt modified diffs using shared helper
	const modifiedSet = new Set(pending.modifiedDiffs);
	const diffsToUpload = await encryptDiffs(diffs, modifiedSet, session.password, session.salt);

	// Compute diffs hash over all local diffs
	const diffsHash = await computeContentHash(diffs);

	// Build keys blob if keys changed
	let encryptedApiKey: string | undefined;
	let keysHash: string | undefined;
	if (pending.keysModified) {
		const apiKeys = await getApiKeys();
		const blob: EncryptedKeysBlob = {
			apiKeys,
			providerSelections: profile.providerSelections as ProviderSelections
		};
		encryptedApiKey = await encryptData(blob, session.password, session.salt);
		keysHash = await computeKeysHash(apiKeys as ApiKeys, profile.providerSelections as ProviderSelections);
	}

	// Build profile metadata if modified
	const profileData = pending.profileModified ? buildProfileMetadata(profile) : undefined;

	await cliFetchJson(`${BASE}/api/profile/${session.profileId}/sync`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(buildSyncPayload({
			passwordHash,
			diffs: diffsToUpload,
			deletedDiffIds: pending.deletedDiffs,
			diffsHash,
			starsHash: '',
			encryptedApiKey,
			keysHash,
			profile: profileData
		}))
	});

	// Update sync meta
	const syncMeta = getSyncMeta();
	syncMeta.diffsHash = diffsHash;
	if (keysHash) syncMeta.keysHash = keysHash;
	syncMeta.lastSyncedAt = new Date().toISOString();
	saveSyncMeta(syncMeta);

	clearPendingChanges();

	return pending.modifiedDiffs.length + pending.deletedDiffs.length +
		(pending.profileModified ? 1 : 0) + (pending.keysModified ? 1 : 0);
}

/** Download changes from the server and merge with local state */
export async function download(session: Session): Promise<{ downloaded: number; profileUpdated: boolean }> {
	const profile = getProfile();
	if (!profile) return { downloaded: 0, profileUpdated: false };

	const localDiffs = getDiffs();
	const pending = getPendingChanges();
	const syncMeta = getSyncMeta();

	const passwordHash = await hashPasswordForTransport(session.password, session.passwordSalt);

	// Pass local hashes so server can skip unchanged collections
	const localKeysHash = syncMeta.keysHash;

	const data = await cliFetchJson<{
		diffs: { id: string; encrypted_data: string }[];
		stars: { id: string; encrypted_data: string }[];
		diffs_skipped?: boolean;
		keys_skipped?: boolean;
		encrypted_api_key?: string;
		salt: string;
		profile?: {
			name: string;
			languages: string[];
			frameworks: string[];
			tools: string[];
			topics: string[];
			depth: string;
			custom_focus: string | null;
		};
	}>(`${BASE}/api/profile/${session.profileId}/content`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			password_hash: passwordHash,
			diffs_hash: syncMeta.diffsHash,
			keys_hash: localKeysHash
		})
	});

	const salt = data.salt || session.salt;
	let downloaded = 0;
	let profileUpdated = false;

	// Merge diffs using shared helper (unless server indicated no changes)
	let mergedDiffs = [...localDiffs];
	if (!data.diffs_skipped) {
		const result = await decryptAndMergeDiffs(data.diffs, localDiffs, pending, session.password, salt);
		mergedDiffs = result.merged;
		downloaded = result.downloaded;
	}

	// Apply keys blob if server returned one and no local key changes pending
	if (data.encrypted_api_key && !pending.keysModified) {
		try {
			const result = await decryptKeysBlob(data.encrypted_api_key, session.password, salt);

			// Store server keys in OS keychain (additive — doesn't remove local keys)
			for (const [provider, key] of Object.entries(result.apiKeys)) {
				if (key) {
					try {
						await setPassword(SERVICE_NAME, provider, key);
					} catch {
						// skip
					}
				}
			}

			// Merge provider selections: local takes precedence over server
			if (result.providerSelections) {
				profile.providerSelections = {
					...result.providerSelections,
					...profile.providerSelections
				};
				profileUpdated = true;
			}
		} catch {
			// skip key decryption failures
		}
	}

	// Apply profile metadata if server returned it and no local profile changes pending
	if (data.profile && !pending.profileModified) {
		profile.name = data.profile.name;
		profile.languages = data.profile.languages || [];
		profile.frameworks = data.profile.frameworks || [];
		profile.tools = data.profile.tools || [];
		profile.topics = data.profile.topics || [];
		profile.depth = data.profile.depth || 'standard';
		profile.customFocus = data.profile.custom_focus || '';
		profileUpdated = true;
	}

	// Sort diffs newest first
	sortDiffsNewestFirst(mergedDiffs);

	saveDiffs(mergedDiffs);
	if (profileUpdated) saveProfile(profile);

	// Update sync meta
	const newDiffsHash = await computeContentHash(mergedDiffs);
	const updatedMeta = getSyncMeta();
	updatedMeta.diffsHash = newDiffsHash;
	updatedMeta.lastSyncedAt = new Date().toISOString();

	// Recompute keys hash from current profile state
	const currentKeys = await getApiKeys();
	const newKeysHash = await computeKeysHash(
		currentKeys as ApiKeys,
		profile.providerSelections as ProviderSelections
	);
	updatedMeta.keysHash = newKeysHash;

	saveSyncMeta(updatedMeta);

	return { downloaded, profileUpdated };
}

/** Full bidirectional sync: download first, then upload */
export async function sync(session: Session): Promise<{ downloaded: number; uploaded: number; profileUpdated: boolean }> {
	const { downloaded, profileUpdated } = await download(session);
	const uploaded = await upload(session);
	return { downloaded, uploaded, profileUpdated };
}
