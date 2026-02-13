/**
 * POST /api/profile/[id]/password
 * Update sync password - re-encrypts all data with new password
 */

import type { RequestHandler } from './$types';
import { getProfileOrError, verifyAndUpgrade, hashPasswordWithSalt } from '../../../auth';

interface PasswordUpdateRequest {
	old_password_hash: string;
	new_password_hash: string;
	new_encrypted_api_key: string;
	new_salt: string;
	diffs: { id: string; encrypted_data: string }[];
	stars: { id: string; encrypted_data: string }[];
}

export const POST: RequestHandler = async ({ request, params, platform }) => {
	const DB = platform?.env?.DB;
	if (!DB) {
		return new Response(JSON.stringify({ error: 'Database not available' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const profileId = params.id;

	try {
		const body: PasswordUpdateRequest = await request.json();

		if (!body.old_password_hash || !body.new_password_hash) {
			return new Response(JSON.stringify({ error: 'Both old and new passwords required' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		if (!body.new_encrypted_api_key || !body.new_salt) {
			return new Response(
				JSON.stringify({ error: 'New encrypted API key and salt required' }),
				{
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				}
			);
		}

		const lookup = await getProfileOrError(DB, profileId);
		if (lookup.error) return lookup.error;

		const auth = await verifyAndUpgrade(DB, lookup.profile, profileId, body.old_password_hash, {
			upgrade: false
		});
		if (auth.error) return auth.error;

		// Build batch statements for atomic update
		const statements: D1PreparedStatement[] = [];

		// Delete all existing diffs for this profile
		statements.push(DB.prepare('DELETE FROM diffs WHERE profile_id = ?').bind(profileId));

		// Delete all existing stars for this profile
		statements.push(DB.prepare('DELETE FROM stars WHERE profile_id = ?').bind(profileId));

		// Insert new encrypted diffs
		if (body.diffs && body.diffs.length > 0) {
			for (const diff of body.diffs) {
				statements.push(
					DB.prepare(
						`
						INSERT INTO diffs (id, profile_id, encrypted_data)
						VALUES (?, ?, ?)
					`
					).bind(diff.id, profileId, diff.encrypted_data)
				);
			}
		}

		// Insert new encrypted stars
		if (body.stars && body.stars.length > 0) {
			for (const star of body.stars) {
				statements.push(
					DB.prepare(
						`
						INSERT INTO stars (id, profile_id, encrypted_data)
						VALUES (?, ?, ?)
					`
					).bind(star.id, profileId, star.encrypted_data)
				);
			}
		}

		// Hash the new password server-side before storing
		const { hash: serverHash, clientSalt } = await hashPasswordWithSalt(body.new_password_hash);

		// Update profile with new password hash, salt, encrypted API key
		statements.push(
			DB.prepare(
				`
				UPDATE profiles
				SET password_hash = ?,
					password_salt = ?,
					salt = ?,
					encrypted_api_key = ?,
					failed_attempts = 0,
					lockout_until = NULL,
					content_updated_at = datetime('now'),
					updated_at = datetime('now')
				WHERE id = ?
			`
			).bind(serverHash, clientSalt, body.new_salt, body.new_encrypted_api_key, profileId)
		);

		// Execute all statements atomically
		await DB.batch(statements);

		return new Response(
			JSON.stringify({
				success: true,
				message: 'Password updated successfully'
			}),
			{
				headers: { 'Content-Type': 'application/json' }
			}
		);
	} catch (error: any) {
		console.error('Password update error:', error);
		return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};
