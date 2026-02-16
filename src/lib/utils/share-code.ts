/**
 * Temporary share code utilities for profile import
 * Codes are short-lived (3 min), single-use, human-readable
 */

const SAFE_CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_PATTERN = /^[A-Z0-9]{4}$/;

/** Check if input looks like a share code (with or without diff- prefix) */
export function isShareCode(input: string): boolean {
	const normalized = input.trim().toUpperCase();
	if (normalized === 'DIFF') return false;
	if (normalized.startsWith('DIFF-')) {
		return CODE_PATTERN.test(normalized.slice(5));
	}
	return CODE_PATTERN.test(normalized);
}

/** Extract the 4-char code from input (strips diff- prefix if present) */
export function parseShareCode(input: string): string {
	const normalized = input.trim().toUpperCase();
	if (normalized.startsWith('DIFF-')) {
		return normalized.slice(5);
	}
	return normalized;
}

/** Format a code for display: diff-XXXX */
export function formatShareCode(code: string): string {
	return `diff-${code.toLowerCase()}`;
}

/** Check if a share code is still alive (not consumed or expired) */
export async function peekShareCode(code: string): Promise<boolean> {
	const normalized = parseShareCode(code);
	const res = await fetch(`/api/share-code/${normalized}`, { method: 'HEAD' });
	return res.ok;
}

/** POST to create a temporary share code for a profile ID */
export async function createShareCode(profileId: string): Promise<{ code: string }> {
	const res = await fetch('/api/share-code', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ profile_id: profileId })
	});
	if (!res.ok) {
		const data = await res.json().catch(() => ({}));
		throw new Error((data as { error?: string }).error || 'Failed to create share code');
	}
	return res.json();
}

/** GET to resolve a share code to a profile ID (consumes the code) */
export async function resolveShareCode(code: string): Promise<string> {
	const normalized = parseShareCode(code);
	const res = await fetch(`/api/share-code/${normalized}`);
	if (!res.ok) {
		const data = await res.json().catch(() => ({}));
		throw new Error((data as { error?: string }).error || 'Invalid or expired share code');
	}
	const data: { profile_id: string } = await res.json();
	return data.profile_id;
}
