import { redirect } from '@sveltejs/kit';
import { profiles, isUnlocked, getProfile } from '$lib/stores/profiles.svelte';
import { getHistory } from '$lib/stores/history.svelte';

export function load() {
	if (!isUnlocked()) {
		const ids = Object.keys(profiles.value);
		redirect(302, ids.length > 0 ? '/profiles' : '/about');
	}

	const history = getHistory();

	// No diffs yet — go straight to generate
	if (history.length === 0) {
		redirect(302, '/generate');
	}

	return {
		selectedDepth: getProfile()?.depth || 'standard'
	};
}
