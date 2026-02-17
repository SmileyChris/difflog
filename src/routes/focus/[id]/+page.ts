import type { PageLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { isUnlocked } from '$lib/stores/profiles.svelte';
import { getHistory } from '$lib/stores/history.svelte';

export const load: PageLoad = async ({ params }) => {
	if (!params.id) redirect(302, '/');

	if (isUnlocked()) {
		const localDiff = getHistory().find((d) => d.id === params.id);
		if (localDiff) {
			return { diff: localDiff };
		}
	}

	redirect(302, '/');
};
