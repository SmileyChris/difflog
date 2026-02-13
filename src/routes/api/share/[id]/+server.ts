/**
 * GET /api/share/[id]
 * Public profile view (no auth required, no sensitive data)
 */

import type { RequestHandler } from './$types';
import type { ProfileRow, ShareResponse } from '../../types';

export const GET: RequestHandler = async ({ params, platform }) => {
	const DB = platform?.env?.DB;
	if (!DB) {
		return new Response(JSON.stringify({ error: 'Database not available' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const id = params.id;

	try {
		const profile = await DB.prepare(
			`
			SELECT id, name, languages, frameworks, tools, topics, depth
			FROM profiles WHERE id = ?
		`
		)
			.bind(id)
			.first<
				Pick<
					ProfileRow,
					'id' | 'name' | 'languages' | 'frameworks' | 'tools' | 'topics' | 'depth'
				>
			>();

		if (!profile) {
			return new Response(JSON.stringify({ error: 'Profile not found' }), {
				status: 404,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		// Get password_salt for import flow (salt is public, hash is not)
		const saltRow = await DB.prepare(`
			SELECT password_salt, password_hash FROM profiles WHERE id = ?
		`)
			.bind(id)
			.first<{ password_salt: string | null; password_hash: string }>();

		// Use dedicated column, fall back to parsing legacy password_hash format
		let passwordSalt: string | null = null;
		if (saltRow?.password_salt) {
			passwordSalt = saltRow.password_salt;
		} else if (saltRow?.password_hash && !saltRow.password_hash.startsWith('v2:')) {
			passwordSalt = saltRow.password_hash.split(':')[0] || null;
		}

		const response: ShareResponse = {
			id: profile.id,
			name: profile.name,
			languages: JSON.parse(profile.languages || '[]'),
			frameworks: JSON.parse(profile.frameworks || '[]'),
			tools: JSON.parse(profile.tools || '[]'),
			topics: JSON.parse(profile.topics || '[]'),
			depth: profile.depth,
			password_salt: passwordSalt
		};

		return new Response(JSON.stringify(response), {
			headers: {
				'Content-Type': 'application/json',
				'Cache-Control': 'no-cache'
			}
		});
	} catch (error: any) {
		console.error('Share profile error:', error);
		return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};
