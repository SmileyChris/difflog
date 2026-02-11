import type { PageLoad } from './$types';
import { isUnlocked } from '$lib/stores/profiles.svelte';
import { getHistory } from '$lib/stores/history.svelte';

export const load: PageLoad = async ({ params, fetch, url }) => {
	if (!params.id) return { error: 'No diff ID provided' };

	const scrollParam = url.searchParams.get('p');
	const scrollToPIndex = scrollParam ? parseInt(scrollParam, 10) : null;

	// Local-first: check history for this diff
	if (isUnlocked()) {
		const localDiff = getHistory().find((d) => d.id === params.id);
		if (localDiff) {
			return { diff: localDiff, isLocal: true, scrollToPIndex };
		}
	}

	// Fallback: fetch from public API
	try {
		const res = await fetch(`/api/diff/${params.id}/public`);
		if (!res.ok) {
			return {
				error:
					res.status === 404
						? 'This diff is not available or has been made private.'
						: 'Failed to load diff'
			};
		}
		const diff = await res.json();
		return { diff, isLocal: false, scrollToPIndex };
	} catch {
		return { error: 'Failed to load diff' };
	}
};
