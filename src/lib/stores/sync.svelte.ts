import { browser } from '$app/environment';
import { persist } from './persist.svelte';
import { activeProfileId, profiles, getProfile, isDemoProfile, updateProfile as updateProfileBase } from './profiles.svelte';
import { histories, getHistory, initHistoryForProfile, deleteHistoryForProfile } from './history.svelte';
import { bookmarks, getStars, initStarsForProfile, deleteStarsForProfile, removeStarsForDiff, starId } from './stars.svelte';
import { isGenerating, clearGenerationState, clearStageCache } from './ui.svelte';
import { timeAgo } from '$lib/utils/time';
import { ApiError } from '$lib/utils/api';
import {
	getSyncPassword,
	setSyncPassword,
	getRememberedPassword,
	setRememberedPassword,
	clearRememberedPassword,
	hasRememberedPassword,
	createEmptyPending,
	trackChange,
	hasPendingChanges as checkPending,
	checkStatus,
	shareProfile as shareProfileApi,
	importProfile as importProfileApi,
	uploadContent,
	downloadContent,
	updatePassword as updatePasswordApi,
	type PendingChanges,
	type SyncStatus,
	type Profile,
	type Diff,
	type Star
} from '$lib/utils/sync';

// Persisted state
const _pendingSync = persist<Record<string, PendingChanges>>('difflog-pending-sync', {});

// Session state
let _syncStatus = $state<SyncStatus | null>(null);
let _syncing = $state(false);
let _syncError = $state<string | null>(null);
let _autoSyncTimeout: ReturnType<typeof setTimeout> | null = null;

// Password state - reactive wrapper around session/localStorage
let _sessionPassword = $state<string | null>(browser ? getSyncPassword() : null);
let _rememberedVersion = $state(0); // Signals changes to localStorage remembered passwords

// State accessors
export const pendingSync = {
	get value() { return _pendingSync.value; },
	set value(val: Record<string, PendingChanges>) { _pendingSync.value = val; }
};

export const syncStatus = {
	get value() { return _syncStatus; },
	set value(val: SyncStatus | null) { _syncStatus = val; }
};

export const syncing = {
	get value() { return _syncing; },
	set value(val: boolean) { _syncing = val; }
};

export const syncError = {
	get value() { return _syncError; },
	set value(val: string | null) { _syncError = val; }
};

// Derived state helpers
export function getSyncState(): 'local' | 'syncing' | 'pending' | 'synced' {
	const profile = getProfile();
	if (!profile?.syncedAt) return 'local';
	if (_syncing) return 'syncing';
	if (!getCachedPassword()) return 'pending';
	return 'synced';
}

export function getLastSyncedAgo(): string {
	const profile = getProfile();
	return profile?.syncedAt ? timeAgo(profile.syncedAt) : '';
}

export function getHasRememberedPassword(): boolean {
	void _rememberedVersion; // Subscribe to remembered password changes
	return activeProfileId.value ? hasRememberedPassword(activeProfileId.value) : false;
}

export function hasRememberedPasswordFor(profileId: string): boolean {
	void _rememberedVersion;
	return hasRememberedPassword(profileId);
}

// Password management
export function getCachedPassword(): string | null {
	if (!browser) return null;

	// Check reactive session state first
	if (_sessionPassword) return _sessionPassword;

	// Fall back to remembered password for active profile (read-only)
	if (activeProfileId.value) {
		void _rememberedVersion; // Subscribe to remembered password changes
		return getRememberedPassword(activeProfileId.value);
	}
	return null;
}

// Restore session password from remembered (call from effects/actions, not derived)
export function restoreSessionPassword(): void {
	if (!browser || _sessionPassword) return;
	if (activeProfileId.value) {
		const remembered = getRememberedPassword(activeProfileId.value);
		if (remembered) {
			_sessionPassword = remembered;
			setSyncPassword(remembered);
		}
	}
}

export function setCachedPassword(val: string | null): void {
	_sessionPassword = val;
	if (browser) {
		setSyncPassword(val);
	}
}

export function rememberPassword(password: string): void {
	if (activeProfileId.value) {
		setRememberedPassword(activeProfileId.value, password);
		_rememberedVersion++;
	}
}

export function forgetPassword(): void {
	_sessionPassword = null;
	if (browser) {
		setSyncPassword(null);
	}
	if (activeProfileId.value) {
		clearRememberedPassword(activeProfileId.value);
	}
	_rememberedVersion++;
}

// Pending sync management
function getPendingSync(): PendingChanges | null {
	if (!activeProfileId.value) return null;
	if (!_pendingSync.value[activeProfileId.value]) {
		_pendingSync.value = {
			..._pendingSync.value,
			[activeProfileId.value]: createEmptyPending()
		};
	}
	return _pendingSync.value[activeProfileId.value];
}

function clearPendingSync(): void {
	if (!activeProfileId.value) return;
	_pendingSync.value = {
		..._pendingSync.value,
		[activeProfileId.value]: createEmptyPending()
	};
}

export function hasPendingChanges(): boolean {
	return checkPending(getPendingSync());
}

// Change tracking
function scheduleAutoSync(): void {
	if (_autoSyncTimeout) clearTimeout(_autoSyncTimeout);
	_autoSyncTimeout = setTimeout(() => autoSync(), 2000);
}

export function trackProfileModified(): void {
	const pending = getPendingSync();
	const profile = getProfile();
	if (!pending || !profile?.syncedAt) return;
	pending.profileModified = true;
	_pendingSync.value = { ..._pendingSync.value };
	scheduleAutoSync();
}

/**
 * Track a change to a diff or star for sync.
 * Consolidates the four tracking functions into one parameterized function.
 */
function trackItemChange(type: 'diff' | 'star', action: 'modified' | 'deleted', id: string): void {
	const profile = getProfile();
	if (!activeProfileId.value || !profile?.syncedAt) return;
	const pending = getPendingSync();
	if (!pending) return;
	_pendingSync.value = {
		..._pendingSync.value,
		[activeProfileId.value]: trackChange(pending, type, action, id)
	};
	scheduleAutoSync();
}

export function trackModifiedDiff(id: string): void {
	trackItemChange('diff', 'modified', id);
}

export function trackDeletedDiff(id: string): void {
	trackItemChange('diff', 'deleted', id);
}

export function trackModifiedStar(id: string): void {
	trackItemChange('star', 'modified', id);
}

export function trackDeletedStar(id: string): void {
	trackItemChange('star', 'deleted', id);
}

// Update profile with sync tracking
export function updateProfile(updates: Partial<Profile>): void {
	updateProfileBase(updates);

	const syncableFields = ['name', 'languages', 'frameworks', 'tools', 'topics', 'depth', 'customFocus'];
	const hasSyncableChange = syncableFields.some((field) => field in updates);
	if (hasSyncableChange) {
		trackProfileModified();
	}
}

// Sync status checking
export async function checkSyncStatus(): Promise<void> {
	_syncStatus = null;
	const profile = getProfile();
	if (!profile?.syncedAt || !activeProfileId.value) return;

	const history = getHistory();
	const stars = getStars();
	const password = getCachedPassword();

	const status = await checkStatus(
		activeProfileId.value,
		profile,
		history,
		stars,
		password
	);

	const hasPending = hasPendingChanges();
	_syncStatus = {
		...status,
		needsSync: status.needsSync || hasPending
	};

	if (!status.exists) {
		const currentProfile = profiles.value[activeProfileId.value];
		if (currentProfile?.syncedAt) {
			profiles.value = {
				...profiles.value,
				[activeProfileId.value]: { ...currentProfile, syncedAt: null }
			};
		}
	}

	if ((status.needsSync || hasPending) && password) {
		try {
			await syncContent(password);
		} catch (e: unknown) {
			handleSyncError(e);
		}
	}
}

// Upload content
async function uploadContentInternal(password: string): Promise<{ uploaded: number }> {
	const profile = getProfile();
	if (!activeProfileId.value || !profile?.syncedAt) {
		throw new Error('Profile not synced to server');
	}

	if (!hasPendingChanges()) {
		return { uploaded: 0 };
	}

	_syncing = true;
	_syncError = null;

	try {
		const history = getHistory();
		const stars = getStars();
		const uploadedPending = getPendingSync() || createEmptyPending();

		const result = await uploadContent(
			activeProfileId.value,
			profile,
			history,
			stars,
			uploadedPending,
			password
		);

		updateProfileBase({
			syncedAt: new Date().toISOString(),
			diffsHash: result.diffsHash,
			starsHash: result.starsHash
		});

		const currentPending = getPendingSync() || createEmptyPending();
		_pendingSync.value = {
			..._pendingSync.value,
			[activeProfileId.value]: {
				modifiedDiffs: currentPending.modifiedDiffs.filter((id) => !uploadedPending.modifiedDiffs.includes(id)),
				modifiedStars: currentPending.modifiedStars.filter((id) => !uploadedPending.modifiedStars.includes(id)),
				deletedDiffs: currentPending.deletedDiffs.filter((id) => !uploadedPending.deletedDiffs.includes(id)),
				deletedStars: currentPending.deletedStars.filter((id) => !uploadedPending.deletedStars.includes(id)),
				profileModified: currentPending.profileModified && !uploadedPending.profileModified
			}
		};

		_syncStatus = {
			exists: true,
			diffs_hash: result.diffsHash,
			stars_hash: result.starsHash,
			content_updated_at: new Date().toISOString()
		};

		return { uploaded: result.uploaded };
	} finally {
		_syncing = false;
	}
}

// Download content
async function downloadContentInternal(password: string): Promise<{ downloaded: number }> {
	const profile = getProfile();
	if (!activeProfileId.value || !profile?.syncedAt) {
		throw new Error('Profile not synced to server');
	}

	_syncing = true;
	_syncError = null;

	try {
		const history = getHistory();
		const stars = getStars();
		const pending = getPendingSync() || createEmptyPending();

		const result = await downloadContent(
			activeProfileId.value,
			profile,
			history,
			stars,
			pending,
			password,
			profile.diffsHash,
			profile.starsHash
		);

		histories.value = { ...histories.value, [activeProfileId.value]: result.diffs };
		bookmarks.value = { ...bookmarks.value, [activeProfileId.value]: result.stars };

		if (result.profileUpdates && activeProfileId.value) {
			const current = profiles.value[activeProfileId.value];
			profiles.value = {
				...profiles.value,
				[activeProfileId.value]: { ...current, ...result.profileUpdates }
			};
		}

		updateProfileBase({
			syncedAt: new Date().toISOString(),
			salt: result.salt,
			diffsHash: result.diffsHash,
			starsHash: result.starsHash
		});

		if (activeProfileId.value) {
			_pendingSync.value = {
				..._pendingSync.value,
				[activeProfileId.value]: result.remainingPending
			};
		}

		// If decryption errors occurred, mark all local diffs/stars as pending
		// so the next upload re-encrypts everything with the correct salt
		if (result.decryptionErrors > 0 && activeProfileId.value) {
			console.warn(`${result.decryptionErrors} item(s) failed to decrypt — scheduling full re-upload`);
			const currentHistory = result.diffs;
			const currentStars = result.stars;
			_pendingSync.value = {
				..._pendingSync.value,
				[activeProfileId.value]: {
					modifiedDiffs: currentHistory.map((d: Diff) => d.id),
					modifiedStars: currentStars.map((s: Star) => starId(s)),
					deletedDiffs: [],
					deletedStars: [],
				}
			};
		}

		_syncStatus = {
			exists: true,
			diffs_hash: result.diffsHash,
			stars_hash: result.starsHash,
			content_updated_at: new Date().toISOString()
		};

		return { downloaded: result.downloaded };
	} finally {
		_syncing = false;
	}
}

// Full sync
export async function syncContent(password: string): Promise<{ uploaded: number; downloaded: number; status: 'synced' | 'uploaded' | 'downloaded' }> {
	const profile = getProfile();
	if (!activeProfileId.value || !profile?.syncedAt) {
		throw new Error('Profile not synced to server');
	}

	const downloadResult = await downloadContentInternal(password);
	const uploadResult = await uploadContentInternal(password);

	setCachedPassword(password);

	let status: 'synced' | 'uploaded' | 'downloaded' = 'synced';
	if (uploadResult.uploaded > 0 && downloadResult.downloaded === 0) status = 'uploaded';
	else if (downloadResult.downloaded > 0 && uploadResult.uploaded === 0) status = 'downloaded';

	return {
		uploaded: uploadResult.uploaded,
		downloaded: downloadResult.downloaded,
		status
	};
}

// Auto sync
export async function autoSync(): Promise<void> {
	if (_autoSyncTimeout) {
		clearTimeout(_autoSyncTimeout);
		_autoSyncTimeout = null;
	}

	const password = getCachedPassword();
	const profile = getProfile();
	if (!password || !profile?.syncedAt) return;
	if (_syncing) return;

	try {
		await downloadContentInternal(password);
		if (hasPendingChanges()) {
			await uploadContentInternal(password);
		}
	} catch (e: unknown) {
		handleSyncError(e);
	}
}

// Share profile
export async function shareProfile(password: string): Promise<string> {
	const profile = getProfile();
	if (!activeProfileId.value || !profile) throw new Error('No active profile');
	if (isDemoProfile()) throw new Error('Demo profiles cannot be synced. Add a real API key first.');

	const { passwordSalt, salt } = await shareProfileApi(activeProfileId.value, profile, password);

	updateProfileBase({ salt, passwordSalt });
	setCachedPassword(password);

	const history = getHistory();
	const stars = getStars();
	if (history.length > 0 || stars.length > 0) {
		const allDiffIds = history.map((d: Diff) => d.id);
		const allStarIds = stars.map((s: Star) => starId(s));
		_pendingSync.value = {
			..._pendingSync.value,
			[activeProfileId.value]: {
				modifiedDiffs: allDiffIds,
				modifiedStars: allStarIds,
				deletedDiffs: [],
				deletedStars: []
			}
		};

		try {
			await uploadContentInternal(password);
		} catch (e) {
			console.error('Failed to upload content during share:', e);
		}
	}

	return activeProfileId.value;
}

// Import profile
export async function importProfile(id: string, password: string): Promise<void> {
	const { profile: importedProfile } = await importProfileApi(id, password);

	profiles.value = { ...profiles.value, [id]: importedProfile };
	initHistoryForProfile(id);
	initStarsForProfile(id);
	activeProfileId.value = id;
	setCachedPassword(password);

	try {
		await downloadContentInternal(password);
	} catch {
		// Content download is non-critical on import
	}
}

// Update password
export async function updatePasswordSync(oldPassword: string, newPassword: string): Promise<void> {
	const profile = getProfile();
	if (!activeProfileId.value || !profile) {
		throw new Error('No active profile');
	}
	if (!profile.syncedAt) {
		throw new Error('Profile not synced to server');
	}
	if (_syncing) {
		throw new Error('Sync in progress, please wait');
	}

	_syncing = true;
	_syncError = null;

	try {
		const history = getHistory();
		const stars = getStars();
		const { passwordSalt, salt } = await updatePasswordApi(
			activeProfileId.value,
			profile,
			history,
			stars,
			oldPassword,
			newPassword
		);

		updateProfileBase({ salt, passwordSalt });
		setCachedPassword(newPassword);
		clearPendingSync();
		updateProfileBase({ syncedAt: new Date().toISOString() });
	} finally {
		_syncing = false;
	}
}

// Error handling helper
function handleSyncError(e: unknown): void {
	console.error('Sync error:', e);
	if (e instanceof ApiError && e.status === 401) {
		_sessionPassword = null;
		if (browser) {
			setSyncPassword(null);
		}
		if (activeProfileId.value) {
			clearRememberedPassword(activeProfileId.value);
		}
		_rememberedVersion++;
		_syncError = 'Invalid password';
	} else if (e instanceof ApiError && e.status === 429) {
		_syncError = e.message;
	} else {
		_syncError = e instanceof Error ? e.message : 'Sync failed';
	}
}

// Switch profile (clears password, then restores from remembered if available)
// Returns false if blocked by an in-progress generation
export function switchProfileWithSync(id: string): boolean {
	if (!profiles.value[id]) return false;
	if (isGenerating()) return false;

	clearGenerationState();
	clearStageCache();
	setCachedPassword(null);
	activeProfileId.value = id;
	restoreSessionPassword();
	checkSyncStatus();
	return true;
}

// Delete profile with cleanup
export function deleteProfileWithSync(id: string): void {
	const { [id]: _, ...rest } = profiles.value;
	profiles.value = rest;

	deleteHistoryForProfile(id);
	deleteStarsForProfile(id);
	clearRememberedPassword(id);

	if (activeProfileId.value === id) {
		const remaining = Object.keys(profiles.value);
		activeProfileId.value = remaining.length > 0 ? remaining[0] : null;
	}
}

// Sync if stale (for visibility change)
export function syncIfStale(): void {
	const password = getCachedPassword();
	const profile = getProfile();
	if (!password || !profile?.syncedAt) return;
	const lastSync = new Date(profile.syncedAt).getTime();
	const oneHour = 60 * 60 * 1000;
	if (Date.now() - lastSync > oneHour) {
		autoSync();
	}
}

// Re-export types
export type { PendingChanges, SyncStatus };
