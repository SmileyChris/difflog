// Composite operations that span multiple domain modules
// These coordinate actions across profiles, history, stars, and sync

import { browser } from '$app/environment';
import { timeAgo } from '$lib/utils/time';
import { ApiError } from '$lib/utils/api';

import {
	profiles,
	activeProfileId,
	getProfile,
	createProfile as createProfileBase,
	type Profile
} from './profiles.svelte';

import {
	histories,
	getHistory,
	addDiff as addDiffBase,
	deleteDiff as deleteDiffBase,
	initHistoryForProfile,
	type Diff
} from './history.svelte';

import {
	bookmarks,
	getStars,
	addStar as addStarBase,
	removeStar as removeStarBase,
	removeStarsForDiff,
	initStarsForProfile,
	starId,
	type Star
} from './stars.svelte';

import {
	syncError,
	getCachedPassword,
	setCachedPassword,
	rememberPassword,
	forgetPassword,
	trackModifiedDiff,
	trackDeletedDiff,
	trackModifiedStar,
	trackDeletedStar,
	checkSyncStatus,
	syncContent,
	syncIfStale
} from './sync.svelte';

import {
	syncDropdownPassword,
	syncDropdownRemember,
	setSyncResultWithTimeout
} from './ui.svelte';

// Profile creation with history/stars initialization
export function createProfile(data: {
	name: string;
	apiKey?: string;
	apiKeys?: Profile['apiKeys'];
	providerSelections?: Profile['providerSelections'];
	languages: string[];
	frameworks: string[];
	tools: string[];
	topics: string[];
	depth: string;
	customFocus: string;
}): string {
	const id = createProfileBase(data);
	initHistoryForProfile(id);
	initStarsForProfile(id);
	return id;
}

// Diff operations with sync tracking
export function addDiff(entry: Diff): void {
	addDiffBase(entry);
	trackModifiedDiff(entry.id);
}

export function deleteDiff(id: string): void {
	const starsToRemove = removeStarsForDiff(id);
	for (const star of starsToRemove) {
		trackDeletedStar(starId(star));
	}
	deleteDiffBase(id);
	trackDeletedDiff(id);
}

// Star operations with sync tracking
export function addStar(entry: Star): void {
	addStarBase(entry);
	trackModifiedStar(starId(entry));
}

export function removeStar(diffId: string, pIndex: number): void {
	removeStarBase(diffId, pIndex);
	trackDeletedStar(starId(diffId, pIndex));
}

// Public diff sharing
export function shareDiff(diffId: string): boolean {
	const profile = getProfile();
	if (!profile?.syncedAt) return false;
	const history = getHistory();
	const diff = history.find((d: Diff) => d.id === diffId);
	if (!diff) return false;

	diff.isPublic = true;
	histories.value = { ...histories.value, [activeProfileId.value!]: [...history] };
	trackModifiedDiff(diffId);
	return true;
}

export function unshareDiff(diffId: string): boolean {
	const history = getHistory();
	const diff = history.find((d: Diff) => d.id === diffId);
	if (!diff) return false;

	diff.isPublic = false;
	histories.value = { ...histories.value, [activeProfileId.value!]: [...history] };
	trackModifiedDiff(diffId);
	return true;
}

export function isDiffPublic(diffId: string): boolean {
	const history = getHistory();
	const diff = history.find((d: Diff) => d.id === diffId);
	return diff?.isPublic === true;
}

export function getPublicDiffUrl(diffId: string): string {
	if (!browser) return '';
	return `${window.location.origin}/d/${diffId}`;
}

// Sync dropdown action
export async function doSyncFromDropdown(): Promise<void> {
	syncError.value = null;

	const password = getCachedPassword();
	if (password) {
		await performSync(password);
		return;
	}

	if (!syncDropdownPassword.value) {
		syncError.value = 'Password required';
		return;
	}

	const pwd = syncDropdownPassword.value;
	const shouldRemember = syncDropdownRemember.value;
	await performSync(pwd);

	if (!syncError.value && shouldRemember) {
		rememberPassword(pwd);
	}
}

async function performSync(password: string): Promise<void> {
	try {
		const result = await syncContent(password);
		setSyncResultWithTimeout(result);
	} catch (e: unknown) {
		if (e instanceof ApiError && e.status === 401) {
			if (activeProfileId.value) {
				forgetPassword();
			}
			syncError.value = 'Invalid password';
		} else if (e instanceof ApiError && e.status === 429) {
			syncError.value = e.message;
		} else {
			syncError.value = e instanceof Error ? e.message : 'Sync failed';
		}
	}
}

// Migration helpers
function migrateOldData(): void {
	if (!browser) return;
	const oldProfiles = localStorage.getItem('difflog-local-profiles');
	if (oldProfiles) {
		localStorage.removeItem('difflog-local-profiles');
		localStorage.removeItem('difflog-content-hashes');
		sessionStorage.removeItem('difflog-session');
	}
}

function migrateToReferenceStars(): void {
	if (!browser) return;
	const stars = getStars();
	const history = getHistory();

	if (activeProfileId.value && stars.length > 0) {
		const hasLegacyStars = stars.some((s: Star) => (s as any).content !== undefined);
		if (hasLegacyStars) {
			bookmarks.value = { ...bookmarks.value, [activeProfileId.value]: [] };
			console.log('[Migration] Cleared legacy content-based stars');
		}
	}

	if (activeProfileId.value && history.length > 0) {
		const hasStoredHtml = history.some((d: Diff) => (d as any).html !== undefined);
		if (hasStoredHtml) {
			histories.value = {
				...histories.value,
				[activeProfileId.value]: history.map((d: Diff) => {
					const { html, ...rest } = d as any;
					return rest;
				})
			};
			console.log('[Migration] Removed stored HTML from diffs');
		}
	}

	if (activeProfileId.value && stars.length > 0) {
		const hasIdField = stars.some((s: Star) => (s as any).id !== undefined);
		if (hasIdField) {
			const seen = new Set<string>();
			const filtered = stars
				.filter((s: Star) => {
					const key = starId(s);
					if (seen.has(key)) return false;
					seen.add(key);
					return true;
				})
				.map((s: Star) => {
					const { id, ...rest } = s as any;
					return rest as Star;
				});
			bookmarks.value = { ...bookmarks.value, [activeProfileId.value]: filtered };
			console.log('[Migration] Removed id field from stars');
		}
	}
}

// Initialize app
export function initApp(): void {
	if (!browser) return;
	migrateOldData();
	migrateToReferenceStars();
	checkSyncStatus();

	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'visible') {
			syncIfStale();
		}
	});
}

// Re-export timeAgo for convenience
export { timeAgo as formatTimeAgo };
