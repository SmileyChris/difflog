/**
 * POST /api/profile/create
 * Create or update a profile with encrypted API key
 * For updates, password must match existing profile
 */

import type { RequestHandler } from './$types';
import type { CreateProfileRequest, ProfileRow } from '../../types';

// Simple timing-safe comparison
function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let result = 0;
	for (let i = 0; i < a.length; i++) {
		result |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return result === 0;
}

export const POST: RequestHandler = async ({ request, platform }) => {
	const DB = platform?.env?.DB;
	if (!DB) {
		return new Response(JSON.stringify({ error: 'Database not available' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	try {
		const body: CreateProfileRequest = await request.json();

		// Validate required fields
		if (!body.name || !body.password_hash || !body.encrypted_api_key || !body.salt) {
			return new Response(JSON.stringify({ error: 'Missing required fields' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		// Use provided ID or generate new one
		const id = body.id || crypto.randomUUID();

		// Check if profile already exists
		const existing = await DB.prepare('SELECT password_hash FROM profiles WHERE id = ?')
			.bind(id)
			.first<Pick<ProfileRow, 'password_hash'>>();

		if (existing) {
			// Profile exists - verify password before allowing update
			if (!timingSafeEqual(existing.password_hash, body.password_hash)) {
				return new Response(JSON.stringify({ error: 'Invalid password' }), {
					status: 401,
					headers: { 'Content-Type': 'application/json' }
				});
			}

			// Password matches - update (including new password_hash if password changed)
			await DB.prepare(
				`
				UPDATE profiles SET
					name = ?, password_hash = ?, encrypted_api_key = ?, salt = ?,
					keys_hash = ?,
					languages = ?, frameworks = ?, tools = ?, topics = ?,
					depth = ?, custom_focus = ?, updated_at = datetime('now'),
					content_updated_at = datetime('now')
				WHERE id = ?
			`
			)
				.bind(
					body.name,
					body.password_hash,
					body.encrypted_api_key,
					body.salt,
					body.keys_hash || null,
					JSON.stringify(body.languages || []),
					JSON.stringify(body.frameworks || []),
					JSON.stringify(body.tools || []),
					JSON.stringify(body.topics || []),
					body.depth || 'standard',
					body.custom_focus || null,
					id
				)
				.run();
		} else {
			// New profile - insert
			await DB.prepare(
				`
				INSERT INTO profiles (
					id, name, password_hash, encrypted_api_key, salt,
					keys_hash,
					languages, frameworks, tools, topics, depth, custom_focus,
					content_updated_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
			`
			)
				.bind(
					id,
					body.name,
					body.password_hash,
					body.encrypted_api_key,
					body.salt,
					body.keys_hash || null,
					JSON.stringify(body.languages || []),
					JSON.stringify(body.frameworks || []),
					JSON.stringify(body.tools || []),
					JSON.stringify(body.topics || []),
					body.depth || 'standard',
					body.custom_focus || null
				)
				.run();
		}

		return new Response(JSON.stringify({ id, name: body.name }), {
			status: 201,
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error: any) {
		console.error('Create profile error:', error);
		return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};
