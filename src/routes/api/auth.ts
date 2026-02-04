/**
 * Shared authentication and rate limiting utilities
 */

import type { ProfileRow } from './types';
import { RATE_LIMIT } from './types';

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
 * Returns null if password is valid, or a Response if there's an error
 */
export async function verifyPassword(
	db: D1Database,
	profile: ProfileRow,
	profileId: string,
	passwordHash: string
): Promise<Response | null> {
	// Check lockout
	const lockout = isLockedOut(profile);
	if (lockout.locked) {
		return new Response(
			JSON.stringify({
				error: 'Too many failed attempts. Try again later.',
				locked: true,
				retry_after_seconds: lockout.remainingSeconds
			}),
			{
				status: 429,
				headers: { 'Content-Type': 'application/json' }
			}
		);
	}

	// Reset attempts if outside window (5 min of no failed attempts)
	if (shouldResetAttempts(profile)) {
		await db.prepare('UPDATE profiles SET failed_attempts = 0 WHERE id = ?').bind(profileId).run();
		profile.failed_attempts = 0;
	}

	// Verify password
	if (!timingSafeEqual(profile.password_hash, passwordHash)) {
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
		return new Response(
			JSON.stringify({
				error: 'Invalid password',
				attempts_remaining: Math.max(0, remaining)
			}),
			{
				status: 401,
				headers: { 'Content-Type': 'application/json' }
			}
		);
	}

	// Password valid
	return null;
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
