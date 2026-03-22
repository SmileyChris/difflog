/**
 * Get credit transaction history
 * GET /api/creds/history?email=xxx&code=xxx&filter=topups|usage
 */

import type { RequestHandler } from './$types';
import { generateCode, jsonResponse } from '../../creds-auth';

interface Transaction {
	id: string;
	type: string;
	amount: number;
	balance_after: number;
	description: string;
	created_at: string;
}

export const GET: RequestHandler = async ({ url, platform }) => {
	const email = url.searchParams.get('email');
	const code = url.searchParams.get('code');
	const filter = url.searchParams.get('filter') || 'topups';

	if (!email || !code) {
		return jsonResponse({ error: 'Email and code required' }, 400);
	}

	const expectedCode = await generateCode(email);
	if (code !== expectedCode) {
		return jsonResponse({ error: 'Invalid credentials' }, 401);
	}

	const DB = platform?.env?.DB;
	if (!DB) return jsonResponse({ error: 'Database not available' }, 500);

	try {
		const account = await DB.prepare(
			'SELECT id, creds FROM accounts WHERE email = ?'
		).bind(email).first<{ id: string; creds: number }>();

		if (!account) {
			return jsonResponse({ transactions: [], creds: 0 });
		}

		const typeFilter = filter === 'usage' ? "type = 'usage'" : "type IN ('purchase', 'bonus')";
		const result = await DB.prepare(`
			SELECT id, type, amount, balance_after, description, created_at
			FROM transactions
			WHERE account_id = ? AND ${typeFilter}
			ORDER BY created_at DESC
			LIMIT 50
		`).bind(account.id).all<Transaction>();

		return jsonResponse({
			transactions: result.results || [],
			creds: account.creds
		});
	} catch (e) {
		console.error('Failed to fetch history:', e);
		return jsonResponse({ error: 'Failed to fetch history' }, 500);
	}
};
