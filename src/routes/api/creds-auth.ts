/**
 * Shared email+code verification for all creds endpoints
 */

import type { AccountRow } from './types';

const DEV_SECRET = 'difflog-dev-secret';

export async function generateCode(email: string): Promise<string> {
	const data = new TextEncoder().encode(email + DEV_SECRET);
	const hash = await crypto.subtle.digest('SHA-256', data);
	const arr = new Uint8Array(hash);
	const num = (arr[0] << 24 | arr[1] << 16 | arr[2] << 8 | arr[3]) >>> 0;
	return String(num % 1000000).padStart(6, '0');
}

export async function verifyCredsAuth(
	db: D1Database,
	email: string,
	code: string
): Promise<AccountRow | null> {
	const expectedCode = await generateCode(email);
	if (code !== expectedCode) return null;

	const account = await db.prepare(
		'SELECT * FROM accounts WHERE email = ?'
	).bind(email).first<AccountRow>();

	return account;
}

export function jsonResponse(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}
