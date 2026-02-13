/**
 * Shared authentication and rate limiting utilities
 */

import type { ProfileRow } from './types';
import { RATE_LIMIT } from './types';

const PBKDF2_ITERATIONS = 100_000;
const SERVER_SALT_BYTES = 16;
const DERIVED_KEY_BYTES = 32;

/**
 * Timing-safe string comparison to prevent timing attacks
 */
export function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let result = 0;
	for (let i = 0; i < a.length; i++) {
		result |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return result === 0;
}

/**
 * Check if a stored hash uses the legacy v1 format (no prefix)
 */
export function isLegacyHash(storedHash: string): boolean {
	return !storedHash.startsWith('v2:');
}

/**
 * Extract the client-side salt from a transport hash (clientSalt:base64digest)
 */
export function extractClientSalt(transportHash: string): string | null {
	const colonIdx = transportHash.indexOf(':');
	if (colonIdx === -1) return null;
	return transportHash.substring(0, colonIdx);
}

/**
 * Hash a transport hash server-side using PBKDF2
 * Returns v2:serverSalt:base64(derivedKey)
 */
export async function hashPasswordServer(transportHash: string): Promise<string> {
	const serverSalt = crypto.getRandomValues(new Uint8Array(SERVER_SALT_BYTES));
	const encoder = new TextEncoder();

	const keyMaterial = await crypto.subtle.importKey(
		'raw',
		encoder.encode(transportHash),
		'PBKDF2',
		false,
		['deriveBits']
	);

	const derivedBits = await crypto.subtle.deriveBits(
		{
			name: 'PBKDF2',
			salt: serverSalt,
			iterations: PBKDF2_ITERATIONS,
			hash: 'SHA-256'
		},
		keyMaterial,
		DERIVED_KEY_BYTES * 8
	);

	const serverSaltB64 = btoa(String.fromCharCode(...serverSalt));
	const derivedKeyB64 = btoa(String.fromCharCode(...new Uint8Array(derivedBits)));

	return `v2:${serverSaltB64}:${derivedKeyB64}`;
}

/**
 * Verify a password against a stored hash (supports both v1 and v2 formats)
 * Returns { valid, legacy } where legacy indicates the hash should be upgraded
 */
export async function verifyPasswordHash(
	storedHash: string,
	transportHash: string
): Promise<{ valid: boolean; legacy: boolean }> {
	if (isLegacyHash(storedHash)) {
		// v1: direct comparison of transport hash
		return { valid: timingSafeEqual(storedHash, transportHash), legacy: true };
	}

	// v2: parse v2:serverSalt:derivedKey
	const parts = storedHash.split(':');
	if (parts.length !== 3 || parts[0] !== 'v2') {
		return { valid: false, legacy: false };
	}

	const serverSaltB64 = parts[1];
	const storedKeyB64 = parts[2];

	const serverSalt = Uint8Array.from(atob(serverSaltB64), (c) => c.charCodeAt(0));
	const encoder = new TextEncoder();

	const keyMaterial = await crypto.subtle.importKey(
		'raw',
		encoder.encode(transportHash),
		'PBKDF2',
		false,
		['deriveBits']
	);

	const derivedBits = await crypto.subtle.deriveBits(
		{
			name: 'PBKDF2',
			salt: serverSalt,
			iterations: PBKDF2_ITERATIONS,
			hash: 'SHA-256'
		},
		keyMaterial,
		DERIVED_KEY_BYTES * 8
	);

	const derivedKeyB64 = btoa(String.fromCharCode(...new Uint8Array(derivedBits)));

	return { valid: timingSafeEqual(storedKeyB64, derivedKeyB64), legacy: false };
}

/**
 * Check if profile is currently locked out due to too many failed attempts
 */
export function isLockedOut(profile: ProfileRow): { locked: boolean; remainingSeconds?: number } {
	if (!profile.lockout_until) return { locked: false };
	const lockoutTime = new Date(profile.lockout_until).getTime();
	const now = Date.now();
	if (now < lockoutTime) {
		return { locked: true, remainingSeconds: Math.ceil((lockoutTime - now) / 1000) };
	}
	return { locked: false };
}

/**
 * Check if we should reset the attempt counter (no attempts in window)
 */
export function shouldResetAttempts(profile: ProfileRow): boolean {
	if (!profile.last_failed_at || profile.failed_attempts === 0) return false;
	const lastFailed = new Date(profile.last_failed_at).getTime();
	const windowMs = RATE_LIMIT.ATTEMPT_WINDOW_MINUTES * 60 * 1000;
	return Date.now() > lastFailed + windowMs;
}

/**
 * Verify password and handle rate limiting
 * Returns { error: null, legacy: boolean } if valid, or { error: Response } if there's an error
 */
export async function verifyPassword(
	db: D1Database,
	profile: ProfileRow,
	profileId: string,
	passwordHash: string
): Promise<{ error: Response; legacy?: undefined } | { error: null; legacy: boolean }> {
	// Check lockout
	const lockout = isLockedOut(profile);
	if (lockout.locked) {
		return {
			error: new Response(
				JSON.stringify({
					error: 'Too many failed attempts. Try again later.',
					locked: true,
					retry_after_seconds: lockout.remainingSeconds
				}),
				{
					status: 429,
					headers: { 'Content-Type': 'application/json' }
				}
			)
		};
	}

	// Reset attempts if outside window (5 min of no failed attempts)
	if (shouldResetAttempts(profile)) {
		await db.prepare('UPDATE profiles SET failed_attempts = 0 WHERE id = ?').bind(profileId).run();
		profile.failed_attempts = 0;
	}

	// Verify password
	const { valid, legacy } = await verifyPasswordHash(profile.password_hash, passwordHash);
	if (!valid) {
		const newAttempts = (profile.failed_attempts || 0) + 1;
		const lockoutUntil =
			newAttempts >= RATE_LIMIT.MAX_ATTEMPTS
				? new Date(Date.now() + RATE_LIMIT.LOCKOUT_MINUTES * 60 * 1000).toISOString()
				: null;

		await db
			.prepare(
				`
			UPDATE profiles
			SET failed_attempts = ?, lockout_until = ?, last_failed_at = datetime('now')
			WHERE id = ?
		`
			)
			.bind(newAttempts, lockoutUntil, profileId)
			.run();

		const remaining = RATE_LIMIT.MAX_ATTEMPTS - newAttempts;
		return {
			error: new Response(
				JSON.stringify({
					error: 'Invalid password',
					attempts_remaining: Math.max(0, remaining)
				}),
				{
					status: 401,
					headers: { 'Content-Type': 'application/json' }
				}
			)
		};
	}

	// Password valid
	return { error: null, legacy };
}

/**
 * Upgrade a legacy v1 hash to v2 server-side hash
 */
export async function upgradePasswordHash(
	db: D1Database,
	profileId: string,
	transportHash: string
): Promise<void> {
	const newHash = await hashPasswordServer(transportHash);
	const clientSalt = extractClientSalt(transportHash);
	await db
		.prepare('UPDATE profiles SET password_hash = ?, password_salt = ? WHERE id = ?')
		.bind(newHash, clientSalt, profileId)
		.run();
}

/**
 * Reset failed attempts after successful authentication
 */
export async function resetFailedAttempts(db: D1Database, profileId: string): Promise<void> {
	await db
		.prepare(
			`
		UPDATE profiles
		SET failed_attempts = 0, lockout_until = NULL
		WHERE id = ?
	`
		)
		.bind(profileId)
		.run();
}

/**
 * Fetch a profile by ID, returning a 404 Response if not found
 */
export async function getProfileOrError(
	db: D1Database,
	profileId: string
): Promise<{ profile: ProfileRow; error?: undefined } | { profile?: undefined; error: Response }> {
	const profile = await db
		.prepare('SELECT * FROM profiles WHERE id = ?')
		.bind(profileId)
		.first<ProfileRow>();

	if (!profile) {
		return {
			error: new Response(JSON.stringify({ error: 'Profile not found' }), {
				status: 404,
				headers: { 'Content-Type': 'application/json' }
			})
		};
	}

	return { profile };
}

/**
 * Verify password, optionally upgrade legacy hash, and optionally reset failed attempts.
 * Combines verifyPassword + upgradePasswordHash + resetFailedAttempts into one call.
 */
export async function verifyAndUpgrade(
	db: D1Database,
	profile: ProfileRow,
	profileId: string,
	passwordHash: string,
	options?: { upgrade?: boolean; resetAttempts?: boolean }
): Promise<{ error: Response } | { error: null; legacy: boolean }> {
	const { upgrade = true, resetAttempts = false } = options ?? {};

	const auth = await verifyPassword(db, profile, profileId, passwordHash);
	if (auth.error) return { error: auth.error };

	if (resetAttempts) {
		await resetFailedAttempts(db, profileId);
	}

	if (upgrade && auth.legacy) {
		await upgradePasswordHash(db, profileId, passwordHash);
	}

	return { error: null, legacy: auth.legacy };
}

/**
 * Hash a transport hash server-side and extract the client salt in one call
 */
export async function hashPasswordWithSalt(
	transportHash: string
): Promise<{ hash: string; clientSalt: string | null }> {
	const hash = await hashPasswordServer(transportHash);
	const clientSalt = extractClientSalt(transportHash);
	return { hash, clientSalt };
}
