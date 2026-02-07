import { browser } from '$app/environment';
import { persist } from './persist.svelte';
import { getAnthropicKey, type Profile } from '$lib/utils/sync';

// Persisted state
const _profiles = persist<Record<string, Profile>>('difflog-profiles', {});

// One-time migration: move legacy apiKey → apiKeys.anthropic
if (browser) {
	let migrated = false;
	const current = _profiles.value;
	for (const profile of Object.values(current)) {
		const legacy = (profile as Record<string, unknown>).apiKey as string | undefined;
		if (legacy) {
			profile.apiKeys = { ...profile.apiKeys, anthropic: profile.apiKeys?.anthropic || legacy };
			delete (profile as Record<string, unknown>).apiKey;
			migrated = true;
		}
	}
	if (migrated) {
		_profiles.value = { ...current };
	}
}
const _activeProfileId = persist<string | null>('difflog-active-profile', null);

// State accessors
export const profiles = {
	get value() { return _profiles.value; },
	set value(val: Record<string, Profile>) { _profiles.value = val; }
};

export const activeProfileId = {
	get value() { return _activeProfileId.value; },
	set value(val: string | null) { _activeProfileId.value = val; }
};

// Derived state
export function getProfile(): Profile | null {
	return _activeProfileId.value ? _profiles.value[_activeProfileId.value] ?? null : null;
}

export function getApiKey(): string | null {
	const profile = getProfile();
	return profile ? getAnthropicKey(profile) ?? null : null;
}

export function isDemoProfile(profile?: Profile | null): boolean {
	const p = profile ?? getProfile();
	return p?.apiKeys?.anthropic === 'demo-key-placeholder';
}

export function isUnlocked(): boolean {
	return getProfile() !== null && getApiKey() !== null;
}

// Actions
export function createProfile(data: {
	name: string;
	apiKeys?: Profile['apiKeys'];
	providerSelections?: Profile['providerSelections'];
	languages: string[];
	frameworks: string[];
	tools: string[];
	topics: string[];
	depth: string;
	customFocus: string;
}): string {
	const id = crypto.randomUUID();
	const newProfile: Profile = {
		id,
		name: data.name,
		apiKeys: data.apiKeys,
		providerSelections: data.providerSelections,
		languages: data.languages,
		frameworks: data.frameworks,
		tools: data.tools,
		topics: data.topics,
		depth: data.depth,
		customFocus: data.customFocus,
		createdAt: new Date().toISOString()
	};

	_profiles.value = { ..._profiles.value, [id]: newProfile };
	_activeProfileId.value = id;

	return id;
}

export function updateProfile(updates: Partial<Profile>): void {
	if (!_activeProfileId.value) return;
	const current = _profiles.value[_activeProfileId.value];
	_profiles.value = {
		..._profiles.value,
		[_activeProfileId.value]: { ...current, ...updates }
	};
}

export function deleteProfile(id: string): void {
	const { [id]: _, ...rest } = _profiles.value;
	_profiles.value = rest;

	if (_activeProfileId.value === id) {
		const remaining = Object.keys(_profiles.value);
		_activeProfileId.value = remaining.length > 0 ? remaining[0] : null;
	}
}

export function switchProfile(id: string): void {
	if (_profiles.value[id]) {
		_activeProfileId.value = id;
	}
}

// Re-export types
export type { Profile };
