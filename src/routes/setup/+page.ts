import { profiles, getProfile } from '$lib/stores/profiles.svelte';
import { LANGUAGES, FRAMEWORKS, TOOLS, TOPICS } from '$lib/utils/constants';
import { PROVIDERS, STEPS } from '$lib/utils/providers';
import type { ProviderStep } from '$lib/utils/providers';

function autoSelectProviders(providerStates: Record<string, { key: string; status: string }>) {
	const selections: Record<ProviderStep, string | null> = { search: null, curation: null, synthesis: null };
	for (const step of STEPS) {
		for (const [id, config] of Object.entries(PROVIDERS)) {
			if (providerStates[id]?.status === 'valid' && config.capabilities.includes(step.id)) {
				selections[step.id] = id;
				break;
			}
		}
	}
	return selections;
}

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
			selections: p.providerSelections || autoSelectProviders(providerStates)
		};
	}

	return {
		isEditing: false,
		initialStep: 0,
		hasExistingProfiles
	};
}
