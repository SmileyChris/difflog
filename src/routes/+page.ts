import { redirect } from '@sveltejs/kit';
import { profiles, isUnlocked, getProfile } from '$lib/stores/profiles.svelte';
import { getHistory, type Diff } from '$lib/stores/history.svelte';

export function load() {
	if (!isUnlocked()) {
		const ids = Object.keys(profiles.value);
		redirect(302, ids.length > 0 ? '/profiles' : '/about');
	}

	// Handle deep-link from stars/archive
	const viewId = sessionStorage.getItem('viewDiffId');
	const scrollToPIndex = sessionStorage.getItem('scrollToPIndex');
	sessionStorage.removeItem('viewDiffId');
	sessionStorage.removeItem('scrollToPIndex');

	const history = getHistory();
	let initialDiff: Diff | null = viewId ? (history.find((d) => d.id === viewId) ?? null) : null;

	// Fall back to latest diff
	if (!initialDiff && history.length > 0) {
		initialDiff = history[0];
	}

	return {
		initialDiff,
		scrollToPIndex: scrollToPIndex ? parseInt(scrollToPIndex, 10) : null,
		selectedDepth: getProfile()?.depth || 'standard'
	};
}
