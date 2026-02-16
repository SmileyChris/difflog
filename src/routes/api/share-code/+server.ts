/**
 * POST /api/share-code
 * Generate a temporary share code that resolves to a profile ID.
 * Stored in KV with 120s TTL, single-use.
 */

import type { RequestHandler } from './$types';

const SAFE_CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 4;
const TTL_SECONDS = 120;

function generateCode(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
	return Array.from(bytes, (b) => SAFE_CHARSET[b % SAFE_CHARSET.length]).join('');
}

export const POST: RequestHandler = async ({ request, platform }) => {
	const KV = platform?.env?.KV;
	if (!KV) {
		return new Response(JSON.stringify({ error: 'KV not available' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	let body: { profile_id?: string };
	try {
		body = await request.json();
	} catch {
		return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	if (!body.profile_id) {
		return new Response(JSON.stringify({ error: 'Missing profile_id' }), {
			status: 400,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	// Generate code, retry once on collision
	for (let attempt = 0; attempt < 2; attempt++) {
		const code = generateCode();
		const key = `share:${code}`;

		const existing = await KV.get(key);
		if (existing) continue;

		await KV.put(key, body.profile_id, { expirationTtl: TTL_SECONDS });

		return new Response(JSON.stringify({ code }), {
			status: 201,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	return new Response(JSON.stringify({ error: 'Failed to generate unique code, try again' }), {
		status: 503,
		headers: { 'Content-Type': 'application/json' }
	});
};
