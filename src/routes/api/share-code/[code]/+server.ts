/**
 * GET /api/share-code/[code]
 * Resolve a temporary share code to a profile ID.
 * Single-use: deletes the code after successful lookup.
 */

import type { RequestHandler } from './$types';

/** HEAD — check if code is still alive (no consumption) */
export const HEAD: RequestHandler = async ({ params, platform }) => {
	const KV = platform?.env?.KV;
	if (!KV) return new Response(null, { status: 500 });

	const code = params.code?.toUpperCase();
	if (!code || code.length !== 4) return new Response(null, { status: 404 });

	const exists = await KV.get(`share:${code}`);
	return new Response(null, { status: exists ? 200 : 404 });
};

/** GET — resolve and consume the code (single-use) */
export const GET: RequestHandler = async ({ params, platform }) => {
	const KV = platform?.env?.KV;
	if (!KV) {
		return new Response(JSON.stringify({ error: 'KV not available' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const code = params.code?.toUpperCase();
	if (!code || code.length !== 4) {
		return new Response(JSON.stringify({ error: 'Invalid or expired share code' }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const key = `share:${code}`;
	const profileId = await KV.get(key);

	if (!profileId) {
		return new Response(JSON.stringify({ error: 'Invalid or expired share code' }), {
			status: 404,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	// Single-use: delete after retrieval
	await KV.delete(key);

	return new Response(JSON.stringify({ profile_id: profileId }), {
		status: 200,
		headers: { 'Content-Type': 'application/json' }
	});
};
