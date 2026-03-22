/**
 * Verify email code and create/return account
 * POST /api/creds/verify
 */

import type { RequestHandler } from './$types';
import { generateCode, jsonResponse } from '../../creds-auth';

const SIGNUP_BONUS = 5;

export const POST: RequestHandler = async ({ request, platform }) => {
	try {
		const body = await request.json() as { email: string; code: string };

		if (!body.email || !body.code) {
			return jsonResponse({ error: 'Email and code are required' }, 400);
		}

		const expectedCode = await generateCode(body.email);
		if (body.code !== expectedCode) {
			return jsonResponse({ error: 'Invalid verification code' }, 400);
		}

		const DB = platform?.env?.DB;
		if (!DB) return jsonResponse({ error: 'Database not available' }, 500);

		// Check if user already exists
		const account = await DB.prepare(
			'SELECT id, creds FROM accounts WHERE email = ?'
		).bind(body.email).first<{ id: string; creds: number }>();

		if (account) {
			return jsonResponse({ success: true, creds: account.creds });
		}

		// New user - create account with free creds
		const accountId = crypto.randomUUID();

		await DB.prepare(`
			INSERT INTO accounts (id, email, creds, created_at, updated_at)
			VALUES (?, ?, ?, datetime('now'), datetime('now'))
		`).bind(accountId, body.email, SIGNUP_BONUS).run();

		await DB.prepare(`
			INSERT INTO transactions (id, account_id, type, amount, balance_after, description, created_at)
			VALUES (?, ?, 'bonus', ?, ?, ?, datetime('now'))
		`).bind(crypto.randomUUID(), accountId, SIGNUP_BONUS, SIGNUP_BONUS, 'Signup bonus').run();

		console.log(`Created account for ${body.email} with ${SIGNUP_BONUS} free creds`);

		return jsonResponse({ success: true, creds: SIGNUP_BONUS });
	} catch {
		return jsonResponse({ error: 'Verification failed' }, 500);
	}
};
