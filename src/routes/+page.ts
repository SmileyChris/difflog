import { redirect } from '@sveltejs/kit';
import { profiles, isUnlocked, getProfile } from '$lib/stores/profiles.svelte';
import { getHistory, type Diff } from '$lib/stores/history.svelte';

export function load({ url }) {
	if (!isUnlocked()) {
		const ids = Object.keys(profiles.value);
		redirect(302, ids.length > 0 ? '/profiles' : '/about');
	}

	const history = getHistory();

	// No diffs yet — go straight to generate
	if (history.length === 0) {
		redirect(302, '/generate');
	}

	// Handle deep-link from stars/archive via search params
	const viewId = url.searchParams.get('diff');
	const scrollParam = url.searchParams.get('p');

	let initialDiff: Diff | null = viewId ? (history.find((d) => d.id === viewId) ?? null) : null;

	// Fall back to latest diff
	if (!initialDiff && history.length > 0) {
		initialDiff = history[0];
	}

	return {
		initialDiff,
		scrollToPIndex: scrollParam ? parseInt(scrollParam, 10) : null,
		selectedDepth: getProfile()?.depth || 'standard'
	};
}
