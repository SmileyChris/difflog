/**
 * GET/PUT/DELETE /api/profile/[id]
 * Get or update profile data (requires password verification)
 * Includes rate limiting for brute force protection
 */

import type { RequestHandler } from './$types';
import type { ProfileResponse } from '../../types';
import { getProfileOrError, verifyAndUpgrade } from '../../auth';

export const GET: RequestHandler = async ({ url, params, platform }) => {
	const DB = platform?.env?.DB;
	if (!DB) {
		return new Response(JSON.stringify({ error: 'Database not available' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const id = params.id;

	try {
		const passwordHash = url.searchParams.get('password_hash');
		const includeData = url.searchParams.get('include_data') === 'true';

		if (!passwordHash) {
			return new Response(JSON.stringify({ error: 'Password required' }), {
				status: 401,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		const lookup = await getProfileOrError(DB, id);
		if (lookup.error) return lookup.error;
		const profile = lookup.profile;

		const auth = await verifyAndUpgrade(DB, profile, id, passwordHash, { resetAttempts: true });
		if (auth.error) return auth.error;

		// Append Z to timestamp so JS parses as UTC
		const contentUpdatedAt = profile.content_updated_at
			? profile.content_updated_at.replace(' ', 'T') + 'Z'
			: null;

		const response: ProfileResponse = {
			id: profile.id,
			name: profile.name,
			encrypted_api_key: profile.encrypted_api_key,
			salt: profile.salt,
			languages: JSON.parse(profile.languages || '[]'),
			frameworks: JSON.parse(profile.frameworks || '[]'),
			tools: JSON.parse(profile.tools || '[]'),
			topics: JSON.parse(profile.topics || '[]'),
			depth: profile.depth,
			custom_focus: profile.custom_focus,
			resolved_sources: profile.resolved_sources ? JSON.parse(profile.resolved_sources) : null,
			content_hash: profile.content_hash,
			content_updated_at: contentUpdatedAt
		};

		// Include encrypted diffs/stars if requested
		if (includeData) {
			const diffsResult = await DB.prepare(
				'SELECT encrypted_data FROM diffs WHERE profile_id = ? ORDER BY created_at DESC'
			)
				.bind(id)
				.all<{ encrypted_data: string }>();

			const starsResult = await DB.prepare(
				'SELECT encrypted_data FROM stars WHERE profile_id = ? ORDER BY created_at DESC'
			)
				.bind(id)
				.all<{ encrypted_data: string }>();

			response.encrypted_diffs = (diffsResult.results || []).map((d) => d.encrypted_data);
			response.encrypted_stars = (starsResult.results || []).map((s) => s.encrypted_data);
		}

		return new Response(JSON.stringify(response), {
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error: any) {
		console.error('Get profile error:', error);
		return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};

export const PUT: RequestHandler = async ({ request, params, platform }) => {
	const DB = platform?.env?.DB;
	if (!DB) {
		return new Response(JSON.stringify({ error: 'Database not available' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const id = params.id;

	try {
		const body = await request.json();
		const { password_hash, ...updates } = body;

		if (!password_hash) {
			return new Response(JSON.stringify({ error: 'Password required' }), {
				status: 401,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		const lookup = await getProfileOrError(DB, id);
		if (lookup.error) return lookup.error;

		const auth = await verifyAndUpgrade(DB, lookup.profile, id, password_hash);
		if (auth.error) return auth.error;

		// Build update query dynamically
		const allowedFields = [
			'name',
			'languages',
			'frameworks',
			'tools',
			'topics',
			'depth',
			'custom_focus',
			'resolved_sources'
		];
		const setClauses: string[] = [
			"updated_at = datetime('now')",
			'failed_attempts = 0',
			'lockout_until = NULL'
		];
		const values: any[] = [];

		for (const field of allowedFields) {
			if (updates[field] !== undefined) {
				setClauses.push(`${field} = ?`);
				if (Array.isArray(updates[field]) || typeof updates[field] === 'object') {
					values.push(JSON.stringify(updates[field]));
				} else {
					values.push(updates[field]);
				}
			}
		}

		values.push(id);

		await DB.prepare(`UPDATE profiles SET ${setClauses.join(', ')} WHERE id = ?`)
			.bind(...values)
			.run();

		return new Response(JSON.stringify({ success: true }), {
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error: any) {
		console.error('Update profile error:', error);
		return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};

export const DELETE: RequestHandler = async ({ url, params, platform }) => {
	const DB = platform?.env?.DB;
	if (!DB) {
		return new Response(JSON.stringify({ error: 'Database not available' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const id = params.id;

	try {
		const passwordHash = url.searchParams.get('password_hash');

		if (!passwordHash) {
			return new Response(JSON.stringify({ error: 'Password required' }), {
				status: 401,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		const lookup = await getProfileOrError(DB, id);
		if (lookup.error) return lookup.error;

		const auth = await verifyAndUpgrade(DB, lookup.profile, id, passwordHash);
		if (auth.error) return auth.error;

		// Delete profile (cascades to diffs and stars)
		await DB.prepare('DELETE FROM profiles WHERE id = ?').bind(id).run();

		return new Response(JSON.stringify({ success: true }), {
			headers: { 'Content-Type': 'application/json' }
		});
	} catch (error: any) {
		console.error('Delete profile error:', error);
		return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};
