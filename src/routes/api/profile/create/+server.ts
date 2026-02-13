/**
 * POST /api/profile/create
 * Create or update a profile with encrypted API key
 * For updates, password must match existing profile
 */

import type { RequestHandler } from './$types';
import type { CreateProfileRequest, ProfileRow } from '../../types';
import { verifyAndUpgrade, hashPasswordWithSalt } from '../../auth';

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
		const existing = await DB.prepare('SELECT * FROM profiles WHERE id = ?')
			.bind(id)
			.first<ProfileRow>();

		if (existing) {
			// Profile exists - verify password with rate limiting
			const auth = await verifyAndUpgrade(DB, existing, id, body.password_hash, {
				upgrade: false
			});
			if (auth.error) return auth.error;

			// Hash the new password server-side
			const { hash: serverHash, clientSalt } = await hashPasswordWithSalt(body.password_hash);

			// Password matches - update (including new password_hash if password changed)
			await DB.prepare(
				`
				UPDATE profiles SET
					name = ?, password_hash = ?, password_salt = ?, encrypted_api_key = ?, salt = ?,
					keys_hash = ?,
					languages = ?, frameworks = ?, tools = ?, topics = ?,
					depth = ?, custom_focus = ?,
					failed_attempts = 0, lockout_until = NULL,
					updated_at = datetime('now'),
					content_updated_at = datetime('now')
				WHERE id = ?
			`
			)
				.bind(
					body.name,
					serverHash,
					clientSalt,
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
			// New profile - hash password server-side before storing
			const { hash: serverHash, clientSalt } = await hashPasswordWithSalt(body.password_hash);

			await DB.prepare(
				`
				INSERT INTO profiles (
					id, name, password_hash, password_salt, encrypted_api_key, salt,
					keys_hash,
					languages, frameworks, tools, topics, depth, custom_focus,
					content_updated_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
			`
			)
				.bind(
					id,
					body.name,
					serverHash,
					clientSalt,
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
