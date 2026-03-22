import { getProfile, isCredsProfile, updateProfile, profiles } from './profiles.svelte';

// Derived from active profile — no separate persisted state
export function isLoggedIn(): boolean {
	const p = getProfile();
	return isCredsProfile(p) && !!p?.credsEmail && !!p?.credsCode;
}

export function getCredBalance(): number {
	return getProfile()?.credBalance as number ?? 0;
}

export function hasCredits(): boolean {
	return getCredBalance() > 0;
}

export function getUserEmail(): string | null {
	return getProfile()?.credsEmail ?? null;
}

export function getCredsAuth(): { email: string; code: string } | null {
	const p = getProfile();
	if (!p?.credsEmail || !p?.credsCode) return null;
	return { email: p.credsEmail, code: p.credsCode };
}

// Actions — mutate the active profile
export function loginUser(email: string, code: string, creds: number): void {
	updateProfile({ credsEmail: email, credsCode: code, credBalance: creds });
}

export function updateCredBalance(creds: number): void {
	updateProfile({ credBalance: creds });
}

export function clearUser(): void {
	updateProfile({ credsEmail: undefined, credsCode: undefined, credBalance: undefined });
}

// Find existing creds account from other profiles
export function getExistingCredsAccount(): { email: string; code: string; profileName: string } | null {
	const allProfiles = profiles.value;
	for (const p of Object.values(allProfiles)) {
		if (p.apiSource === 'creds' && p.credsEmail && p.credsCode) {
			return { email: p.credsEmail, code: p.credsCode, profileName: p.name };
		}
	}
	return null;
}
