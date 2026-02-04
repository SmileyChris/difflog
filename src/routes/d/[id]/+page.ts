import type { PageLoad } from './$types';

interface PublicDiff {
	id: string;
	content: string;
	title?: string;
	generated_at: string;
	profile_name: string;
}

export const load: PageLoad = async ({ params, fetch }) => {
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
		return { diff };
	} catch {
		return { error: 'Failed to load diff' };
	}
};
