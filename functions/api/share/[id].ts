/**
 * GET /api/share/[id]
 * Public profile view (no auth required, no sensitive data)
 */

import type { Env, ProfileRow, ShareResponse } from '../../types';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { DB } = context.env;
  const id = context.params.id as string;

  try {
    const profile = await DB.prepare(`
      SELECT id, name, languages, frameworks, tools, topics, depth
      FROM profiles WHERE id = ?
    `).bind(id).first<Pick<ProfileRow, 'id' | 'name' | 'languages' | 'frameworks' | 'tools' | 'topics' | 'depth'>>();

    if (!profile) {
      return new Response(JSON.stringify({ error: 'Profile not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get password_salt for import flow (salt is public, hash is not)
    const fullProfile = await DB.prepare(`
      SELECT password_hash FROM profiles WHERE id = ?
    `).bind(id).first<{ password_hash: string }>();

    // Extract just the salt portion (before the colon)
    const passwordSalt = fullProfile?.password_hash?.split(':')[0] || null;

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
