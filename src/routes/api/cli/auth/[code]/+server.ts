import type { RequestHandler } from './$types';

const CODE_RE = /^[0-9a-f]{12}$/;

function json(data: unknown, status = 200) {
	return new Response(JSON.stringify(data), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});
}

/** GET — CLI polls for encrypted session */
export const GET: RequestHandler = async ({ params, platform }) => {
	const KV = platform?.env?.KV;
	if (!KV) return json({ error: 'KV not available' }, 500);

	if (!CODE_RE.test(params.code)) return json({ error: 'Invalid code' }, 400);

	const blob = await KV.get(params.code);
	if (!blob) return json({ pending: true });

	await KV.delete(params.code);
	return json({ session: blob });
};

/** POST — Browser submits encrypted session */
export const POST: RequestHandler = async ({ params, platform, request }) => {
	const KV = platform?.env?.KV;
	if (!KV) return json({ error: 'KV not available' }, 500);

	if (!CODE_RE.test(params.code)) return json({ error: 'Invalid code' }, 400);

	const body = (await request.json()) as { encrypted_session?: string; expires?: number };
	if (!body.encrypted_session || typeof body.encrypted_session !== 'string') {
		return json({ error: 'Missing encrypted_session' }, 400);
	}

	// Calculate TTL from expires timestamp (default to 5 min if not provided, max 5 min)
	const ttl = body.expires
		? Math.min(300, Math.max(1, Math.ceil((body.expires - Date.now()) / 1000)))
		: 300;

	await KV.put(params.code, body.encrypted_session, { expirationTtl: ttl });
	return json({ ok: true });
};
