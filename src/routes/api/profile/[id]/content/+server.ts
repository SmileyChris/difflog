/**
 * POST /api/profile/[id]/content
 * Download encrypted diffs and stars for a profile
 * Requires password authentication
 */

import type { RequestHandler } from './$types';
import type { ProfileRow, ContentRequest, ContentResponse } from '../../../types';
import { verifyPassword, resetFailedAttempts } from '../../../auth';

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
		const body: ContentRequest = await request.json();

		if (!body.password_hash) {
			return new Response(JSON.stringify({ error: 'Password required' }), {
				status: 401,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		// Fetch profile
		const profile = await DB.prepare('SELECT * FROM profiles WHERE id = ?')
			.bind(profileId)
			.first<ProfileRow>();

		if (!profile) {
			return new Response(JSON.stringify({ error: 'Profile not found' }), {
				status: 404,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		// Verify password with rate limiting
		const authError = await verifyPassword(DB, profile, profileId, body.password_hash);
		if (authError) return authError;

		// Reset failed attempts on success
		await resetFailedAttempts(DB, profileId);

		// Check if client already has current content (skip fetching if hashes match)
		const skipDiffs = body.diffs_hash && body.diffs_hash === profile.diffs_hash;
		const skipStars = body.stars_hash && body.stars_hash === profile.stars_hash;
		const skipKeys = body.keys_hash && body.keys_hash === (profile as ProfileRow).keys_hash;

		// Fetch diffs and stars only if needed
		let diffs: { id: string; encrypted_data: string }[] = [];
		let stars: { id: string; encrypted_data: string }[] = [];

		if (!skipDiffs) {
			const diffsResult = await DB.prepare(
				'SELECT id, encrypted_data FROM diffs WHERE profile_id = ?'
			)
				.bind(profileId)
				.all<{ id: string; encrypted_data: string }>();
			diffs = diffsResult.results || [];
		}

		if (!skipStars) {
			const starsResult = await DB.prepare(
				'SELECT id, encrypted_data FROM stars WHERE profile_id = ?'
			)
				.bind(profileId)
				.all<{ id: string; encrypted_data: string }>();
			stars = starsResult.results || [];
		}

		const response: ContentResponse = {
			diffs,
			stars,
			diffs_skipped: skipDiffs || undefined,
			stars_skipped: skipStars || undefined,
			encrypted_api_key: skipKeys ? undefined : profile.encrypted_api_key,
			keys_skipped: skipKeys || undefined,
			content_hash: profile.content_hash,
			salt: profile.salt,
			// Include profile metadata for sync
			profile: {
				name: profile.name,
				languages: JSON.parse(profile.languages || '[]'),
				frameworks: JSON.parse(profile.frameworks || '[]'),
				tools: JSON.parse(profile.tools || '[]'),
				topics: JSON.parse(profile.topics || '[]'),
				depth: profile.depth,
				custom_focus: profile.custom_focus
			}
		};

		return new Response(JSON.stringify(response), {
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error: any) {
		console.error('Content download error:', error);
		return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};
