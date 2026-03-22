import { persist } from './persist.svelte';
import type { User } from '$lib/types/sync';

// Persisted state
const _user = persist<User | null>('difflog-user', null);

// State accessor
export const user = {
	get value() { return _user.value; },
	set value(val: User | null) { _user.value = val; }
};

// Derived
export function isLoggedIn(): boolean {
	return _user.value !== null;
}

export function getCredBalance(): number {
	return _user.value?.creds ?? 0;
}

export function hasCredits(): boolean {
	return getCredBalance() > 0;
}

export function getUserEmail(): string | null {
	return _user.value?.email ?? null;
}

// Actions
export function loginUser(email: string, code: string, creds: number): void {
	_user.value = { email, code, creds };
}

export function addCredits(amount: number): void {
	if (!_user.value) return;
	_user.value = { ..._user.value, creds: _user.value.creds + amount };
}

export function updateCredBalance(creds: number): void {
	if (!_user.value) return;
	_user.value = { ..._user.value, creds };
}

export function clearUser(): void {
	_user.value = null;
}
