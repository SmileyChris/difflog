/**
 * GET /api/profile/[id]/status
 * Public endpoint - returns whether profile exists and its content hash
 * No password required (doesn't expose sensitive data)
 */

import type { Env, ProfileRow } from '../../../types';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { DB } = context.env;
  const id = context.params.id as string;

  try {
    const profile = await DB.prepare(
      'SELECT id, diffs_hash, stars_hash, content_updated_at FROM profiles WHERE id = ?'
    ).bind(id).first<Pick<ProfileRow, 'id' | 'diffs_hash' | 'stars_hash' | 'content_updated_at'>>();

    if (!profile) {
      return new Response(JSON.stringify({ exists: false }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Append Z to timestamp so JS parses as UTC (SQLite datetime('now') is UTC but lacks suffix)
    const contentUpdatedAt = profile.content_updated_at
      ? profile.content_updated_at.replace(' ', 'T') + 'Z'
      : null;

    return new Response(JSON.stringify({
      exists: true,
      diffs_hash: profile.diffs_hash,
      stars_hash: profile.stars_hash,
      content_updated_at: contentUpdatedAt
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    console.error('Profile status error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
