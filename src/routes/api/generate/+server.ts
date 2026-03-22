/**
 * Server-side diff generation for creds mode
 * POST /api/generate
 */

import type { RequestHandler } from './$types';
import { generateCode, jsonResponse } from '../creds-auth';

interface GenerateRequest {
	email: string;
	code: string;
	prompt: string;
	depth?: 'quick' | 'standard' | 'deep';
}

const DEPTH_TOKEN_LIMITS: Record<string, number> = {
	quick: 4096,
	standard: 8192,
	deep: 16384
};

function getCredCost(depth: string): number {
	return depth === 'deep' ? 2 : 1;
}

export const POST: RequestHandler = async ({ request, platform }) => {
	const ANTHROPIC_API_KEY = platform?.env?.ANTHROPIC_API_KEY;
	if (!ANTHROPIC_API_KEY) {
		return jsonResponse({ error: 'API not configured' }, 500);
	}

	const DB = platform?.env?.DB;
	if (!DB) return jsonResponse({ error: 'Database not available' }, 500);

	try {
		const body = await request.json() as GenerateRequest;
		const { email, code, prompt, depth = 'standard' } = body;
		const credCost = getCredCost(depth);

		if (!email || !code || !prompt) {
			return jsonResponse({ error: 'Missing required fields' }, 400);
		}

		// Verify credentials
		const expectedCode = await generateCode(email);
		if (code !== expectedCode) {
			return jsonResponse({ error: 'Invalid credentials' }, 401);
		}

		// Get account and check creds
		const account = await DB.prepare(
			'SELECT id, creds FROM accounts WHERE email = ?'
		).bind(email).first<{ id: string; creds: number }>();

		if (!account) {
			return jsonResponse({ error: 'Account not found' }, 404);
		}

		if (account.creds < credCost) {
			return jsonResponse({ error: 'Insufficient creds', required: credCost, available: account.creds }, 402);
		}

		// Check daily limit (5 per day UTC)
		const today = new Date().toISOString().slice(0, 10);
		const usageToday = await DB.prepare(`
			SELECT COUNT(*) as count FROM transactions
			WHERE account_id = ? AND type = 'usage' AND date(created_at) = ?
		`).bind(account.id, today).first<{ count: number }>();

		if (usageToday && usageToday.count >= 5) {
			return jsonResponse({ error: 'Daily limit reached' }, 429);
		}

		// Call Anthropic API
		const res = await fetch('https://api.anthropic.com/v1/messages', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-api-key': ANTHROPIC_API_KEY,
				'anthropic-version': '2023-06-01',
			},
			body: JSON.stringify({
				model: 'claude-sonnet-4-5',
				max_tokens: DEPTH_TOKEN_LIMITS[depth] || 8192,
				messages: [{ role: 'user', content: prompt }],
				tools: [{
					name: 'submit_diff',
					description: 'Submit the generated developer intelligence diff',
					input_schema: {
						type: 'object',
						properties: {
							title: {
								type: 'string',
								description: 'A short, creative title (3-8 words) capturing the main theme of this diff. Plain text, no markdown.'
							},
							content: {
								type: 'string',
								description: 'The full markdown content of the diff, starting with the date line'
							}
						},
						required: ['title', 'content']
					}
				}],
				tool_choice: { type: 'tool', name: 'submit_diff' }
			}),
		});

		if (!res.ok) {
			const err = await res.json() as { error?: { message?: string } };
			console.error('Anthropic API error:', err);
			return jsonResponse({ error: err.error?.message || 'API error' }, res.status);
		}

		const result = await res.json() as {
			content: Array<{ type: string; input?: { title?: string; content?: string } }>;
			usage?: { input_tokens: number; output_tokens: number };
		};

		const toolUse = result.content.find(b => b.type === 'tool_use');
		if (!toolUse?.input?.content) {
			return jsonResponse({ error: 'No content returned from API' }, 500);
		}

		// Deduct creds and log transaction
		const newBalance = account.creds - credCost;
		await DB.prepare(
			"UPDATE accounts SET creds = ?, updated_at = datetime('now') WHERE id = ?"
		).bind(newBalance, account.id).run();

		const description = credCost > 1 ? `Generated diff (${depth})` : 'Generated diff';
		await DB.prepare(`
			INSERT INTO transactions (id, account_id, type, amount, balance_after, description, created_at)
			VALUES (?, ?, 'usage', ?, ?, ?, datetime('now'))
		`).bind(crypto.randomUUID(), account.id, -credCost, newBalance, description).run();

		const diffId = crypto.randomUUID();
		const title = toolUse.input.title || '';
		const content = toolUse.input.content;

		// Save diff server-side for recovery
		await DB.prepare(`
			INSERT INTO pending_diffs (id, account_id, title, content, created_at)
			VALUES (?, ?, ?, ?, datetime('now'))
		`).bind(diffId, account.id, title, content).run();

		return jsonResponse({
			id: diffId,
			title,
			content,
			usage: result.usage,
			creds: newBalance
		});
	} catch (e) {
		console.error('Generate error:', e);
		return jsonResponse({ error: 'Generation failed' }, 500);
	}
};
