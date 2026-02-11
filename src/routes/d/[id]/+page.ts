import type { PageLoad } from './$types';

interface PublicDiff {
	id: string;
	content: string;
	title?: string;
	generated_at: string;
	profile_name: string;
	window_days?: number;
}

export const load: PageLoad = async ({ params, fetch, url }) => {
	if (!params.id) {
		return { error: 'No diff ID provided' };
	}

	try {
		const res = await fetch(`/api/diff/${params.id}/public`);

		if (!res.ok) {
			if (res.status === 404) {
				return { error: 'This diff is not available or has been made private.' };
			}
			return { error: 'Failed to load diff' };
		}

		const diff: PublicDiff = await res.json();
		const scrollParam = url.searchParams.get('p');
		return { diff, scrollToPIndex: scrollParam ? parseInt(scrollParam, 10) : null };
	} catch {
		return { error: 'Failed to load diff' };
	}
};
