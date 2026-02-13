import { getSession, getProfile, getDiffs, saveDiffs, saveProfile, getPendingChanges, clearPendingChanges, getSyncMeta, saveSyncMeta, getApiKeys } from './config';
import type { Session, Profile, Diff, PendingChanges, SyncMeta } from './config';
import { localAwareFetch, BASE } from './api';
import { encryptData, decryptData, hashPasswordForTransport, computeContentHash } from '../lib/utils/crypto';
import { computeKeysHash } from '../lib/utils/sync';
import type { ProviderSelections, ApiKeys } from '../lib/utils/sync';
import { setPassword } from 'cross-keychain';

interface EncryptedKeysBlob {
	apiKeys: Record<string, string>;
	providerSelections?: ProviderSelections;
}

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

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
	const res = await localAwareFetch(url, init);
	if (!res.ok) {
		const data = (await res.json().catch(() => ({}))) as { error?: string };
		throw new Error(data.error || `Request failed: ${res.status}`);
	}
	return res.json() as Promise<T>;
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

	// Encrypt modified diffs
	const modifiedSet = new Set(pending.modifiedDiffs);
	const diffsToUpload: { id: string; encrypted_data: string }[] = [];
	for (const diff of diffs) {
		if (!modifiedSet.has(diff.id)) continue;
		if (diff.isPublic) {
			const { isPublic, ...diffData } = diff;
			diffsToUpload.push({ id: diff.id, encrypted_data: JSON.stringify(diffData) });
		} else {
			const encrypted = await encryptData(diff, session.password, session.salt);
			diffsToUpload.push({ id: diff.id, encrypted_data: encrypted });
		}
	}

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
	const profileData = pending.profileModified ? {
		name: profile.name,
		languages: profile.languages,
		frameworks: profile.frameworks,
		tools: profile.tools,
		topics: profile.topics,
		depth: profile.depth,
		custom_focus: profile.customFocus
	} : undefined;

	await fetchJson(`${BASE}/api/profile/${session.profileId}/sync`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			password_hash: passwordHash,
			diffs: diffsToUpload,
			deleted_diff_ids: pending.deletedDiffs,
			diffs_hash: diffsHash,
			stars_hash: '',
			encrypted_api_key: encryptedApiKey,
			keys_hash: keysHash,
			profile: profileData
		})
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

	const data = await fetchJson<{
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

	// Merge diffs (unless server indicated no changes)
	let mergedDiffs = [...localDiffs];
	const pendingModified = new Set(pending.modifiedDiffs);
	const pendingDeleted = new Set(pending.deletedDiffs);

	if (!data.diffs_skipped) {
		const serverDiffIds = new Set<string>();

		for (const encDiff of data.diffs) {
			try {
				let diff: Diff;
				if (encDiff.encrypted_data.startsWith('{')) {
					diff = JSON.parse(encDiff.encrypted_data);
					diff.isPublic = true;
				} else {
					diff = await decryptData<Diff>(encDiff.encrypted_data, session.password, salt);
					diff.isPublic = false;
				}
				serverDiffIds.add(encDiff.id);

				const existingIdx = mergedDiffs.findIndex(d => d.id === encDiff.id);
				if (existingIdx === -1 && !pendingDeleted.has(encDiff.id)) {
					mergedDiffs.push(diff);
					downloaded++;
				} else if (existingIdx !== -1 && !pendingModified.has(encDiff.id)) {
					// Server wins for non-locally-modified diffs
					mergedDiffs[existingIdx] = diff;
				}
			} catch {
				// skip diffs that fail to decrypt
			}
		}

		// Remove diffs deleted on server (unless locally modified or pending delete)
		mergedDiffs = mergedDiffs.filter(d =>
			serverDiffIds.has(d.id) || pendingDeleted.has(d.id) || pendingModified.has(d.id)
		);
	}

	// Apply keys blob if server returned one and no local key changes pending
	if (data.encrypted_api_key && !pending.keysModified) {
		try {
			const decrypted = await decryptData<EncryptedKeysBlob | Record<string, string>>(
				data.encrypted_api_key, session.password, salt
			);

			let apiKeys: Record<string, string>;
			let providerSelections: ProviderSelections | undefined;

			if (decrypted && typeof decrypted === 'object' && 'apiKeys' in decrypted) {
				const blob = decrypted as EncryptedKeysBlob;
				apiKeys = blob.apiKeys;
				providerSelections = blob.providerSelections;
			} else {
				apiKeys = decrypted as Record<string, string>;
			}

			// Store keys in OS keychain
			for (const [provider, key] of Object.entries(apiKeys)) {
				if (key) {
					try {
						await setPassword(SERVICE_NAME, provider, key);
					} catch {
						// skip
					}
				}
			}

			// Update provider selections on profile
			if (providerSelections) {
				profile.providerSelections = providerSelections;
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
	mergedDiffs.sort((a, b) => new Date(b.generated_at).getTime() - new Date(a.generated_at).getTime());

	saveDiffs(mergedDiffs);
	if (profileUpdated) saveProfile(profile);

	// Update sync meta
	const newDiffsHash = await computeContentHash(mergedDiffs);
	const updatedMeta = getSyncMeta();
	updatedMeta.diffsHash = newDiffsHash;
	updatedMeta.lastSyncedAt = new Date().toISOString();
	saveSyncMeta(updatedMeta);

	return { downloaded, profileUpdated };
}

/** Full bidirectional sync: download first, then upload */
export async function sync(session: Session): Promise<{ downloaded: number; uploaded: number; profileUpdated: boolean }> {
	const { downloaded, profileUpdated } = await download(session);
	const uploaded = await upload(session);
	return { downloaded, uploaded, profileUpdated };
}
