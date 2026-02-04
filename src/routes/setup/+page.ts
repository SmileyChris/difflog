import { profiles, getProfile } from '$lib/stores/profiles.svelte';
import { LANGUAGES, FRAMEWORKS, TOOLS, TOPICS } from '$lib/utils/constants';
import { PROVIDERS } from '$lib/utils/providers';

export function load({ url }) {
	const hasExistingProfiles = Object.keys(profiles.value).length > 0;
	const editStep = url.searchParams.get('edit');
	const currentProfile = getProfile();

	if (editStep && currentProfile) {
		const p = currentProfile;

		// Extract custom items (not in predefined options)
		const customLanguages = (p.languages || []).filter((i: string) => !LANGUAGES.includes(i));
		const customFrameworks = (p.frameworks || []).filter((i: string) => !FRAMEWORKS.includes(i));
		const customTools = (p.tools || []).filter((i: string) => !TOOLS.includes(i));
		const customTopics = (p.topics || []).filter((i: string) => !TOPICS.includes(i));

		// Build provider states from existing keys
		const providerStates: Record<string, { key: string; status: 'valid' | 'idle'; masked: boolean }> = {};
		for (const id of Object.keys(PROVIDERS)) {
			providerStates[id] = { key: '', status: 'idle', masked: true };
		}

		if (p.apiKey) {
			providerStates.anthropic = { key: p.apiKey, status: 'valid', masked: true };
		}
		if (p.apiKeys) {
			for (const [id, key] of Object.entries(p.apiKeys)) {
				if (key && providerStates[id]) {
					providerStates[id] = { key: key as string, status: 'valid', masked: true };
				}
			}
		}

		return {
			isEditing: true,
			initialStep: parseInt(editStep),
			hasExistingProfiles,
			initialData: {
				name: p.name,
				languages: [...(p.languages || [])],
				frameworks: [...(p.frameworks || [])],
				tools: [...(p.tools || [])],
				topics: [...(p.topics || [])],
				depth: p.depth || 'standard',
				customFocus: p.customFocus || ''
			},
			customItems: {
				languages: customLanguages,
				frameworks: customFrameworks,
				tools: customTools,
				topics: customTopics
			},
			providerStates,
			selections: p.providerSelections || { search: null, curation: null, synthesis: null }
		};
	}

	return {
		isEditing: false,
		initialStep: 0,
		hasExistingProfiles
	};
}
