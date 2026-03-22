/**
 * Fetch and claim pending diffs for a user
 * POST /api/creds/pending
 * Body: { email, code, claim: [id, ...] }
 */

import type { RequestHandler } from './$types';
import { generateCode, jsonResponse } from '../../creds-auth';

interface PendingDiff {
	id: string;
	title: string;
	content: string;
	created_at: string;
}

export const POST: RequestHandler = async ({ request, platform }) => {
	const DB = platform?.env?.DB;
	if (!DB) return jsonResponse({ error: 'Database not available' }, 500);

	try {
		const body = await request.json() as { email: string; code: string; claim?: string[] };
		const { email, code, claim } = body;

		if (!email || !code) {
			return jsonResponse({ error: 'Email and code required' }, 400);
		}

		const expectedCode = await generateCode(email);
		if (code !== expectedCode) {
			return jsonResponse({ error: 'Invalid credentials' }, 401);
		}

		const account = await DB.prepare(
			'SELECT id FROM accounts WHERE email = ?'
		).bind(email).first<{ id: string }>();

		if (!account) {
			return jsonResponse({ diffs: [] });
		}

		// Claim (delete) specified diffs
		if (claim && claim.length > 0) {
			const placeholders = claim.map(() => '?').join(',');
			await DB.prepare(`
				DELETE FROM pending_diffs
				WHERE account_id = ? AND id IN (${placeholders})
			`).bind(account.id, ...claim).run();
		}

		// Fetch remaining pending diffs
		const result = await DB.prepare(`
			SELECT id, title, content, created_at
			FROM pending_diffs
			WHERE account_id = ?
			ORDER BY created_at DESC
			LIMIT 10
		`).bind(account.id).all<PendingDiff>();

		return jsonResponse({ diffs: result.results || [] });
	} catch (e) {
		console.error('Pending diffs error:', e);
		return jsonResponse({ error: 'Failed to fetch pending diffs' }, 500);
	}
};
