/**
 * POST /api/profile/[id]/sync
 * Upload encrypted diffs and stars when user wants to share/backup
 * All data is pre-encrypted client-side, hashes computed client-side
 */

import type { Env, ProfileRow, SyncRequest } from '../../../types';
import { STORAGE_LIMITS } from '../../../types';
import { verifyPassword } from '../../../lib/auth';

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { DB } = context.env;
  const profileId = context.params.id as string;

  try {
    const body: SyncRequest = await context.request.json();

    if (!body.password_hash) {
      return new Response(JSON.stringify({ error: 'Password required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Fetch profile
    const profile = await DB.prepare(
      'SELECT * FROM profiles WHERE id = ?'
    ).bind(profileId).first<ProfileRow>();

    if (!profile) {
      return new Response(JSON.stringify({ error: 'Profile not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Verify password with rate limiting
    const authError = await verifyPassword(DB, profile, profileId, body.password_hash);
    if (authError) return authError;

    // Build batch statements
    const statements: D1PreparedStatement[] = [];

    // Insert/update diffs
    if (body.diffs && body.diffs.length > 0) {
      for (const diff of body.diffs) {
        statements.push(
          DB.prepare(`
            INSERT OR REPLACE INTO diffs (id, profile_id, encrypted_data)
            VALUES (?, ?, ?)
          `).bind(diff.id, profileId, diff.encrypted_data)
        );
      }
    }

    // Insert/update stars
    if (body.stars && body.stars.length > 0) {
      for (const star of body.stars) {
        statements.push(
          DB.prepare(`
            INSERT OR REPLACE INTO stars (id, profile_id, encrypted_data)
            VALUES (?, ?, ?)
          `).bind(star.id, profileId, star.encrypted_data)
        );
      }
    }

    // Delete removed diffs
    if (body.deleted_diff_ids && body.deleted_diff_ids.length > 0) {
      for (const diffId of body.deleted_diff_ids) {
        statements.push(
          DB.prepare('DELETE FROM diffs WHERE id = ? AND profile_id = ?').bind(diffId, profileId)
        );
      }
    }

    // Delete removed stars
    if (body.deleted_star_ids && body.deleted_star_ids.length > 0) {
      for (const starId of body.deleted_star_ids) {
        statements.push(
          DB.prepare('DELETE FROM stars WHERE id = ? AND profile_id = ?').bind(starId, profileId)
        );
      }
    }

    // Execute batch
    if (statements.length > 0) {
      await DB.batch(statements);
    }

    // Enforce diff cap: delete oldest diffs beyond MAX_DIFFS
    await DB.prepare(`
      DELETE FROM diffs
      WHERE profile_id = ?
        AND id NOT IN (
          SELECT id FROM diffs
          WHERE profile_id = ?
          ORDER BY created_at DESC
          LIMIT ?
        )
    `).bind(profileId, profileId, STORAGE_LIMITS.MAX_DIFFS).run();

    // Use client-provided hashes (client computed over all local content)
    const updateClauses = [
      'failed_attempts = 0',
      'lockout_until = NULL',
      'content_updated_at = datetime(\'now\')',
      'updated_at = datetime(\'now\')'
    ];
    const updateValues: any[] = [];

    if (body.diffs_hash) {
      updateClauses.push('diffs_hash = ?');
      updateValues.push(body.diffs_hash);
    }

    if (body.stars_hash) {
      updateClauses.push('stars_hash = ?');
      updateValues.push(body.stars_hash);
    }

    if (body.resolved_sources) {
      updateClauses.push('resolved_sources = ?');
      updateValues.push(JSON.stringify(body.resolved_sources));
    }

    // Update profile metadata if provided
    if (body.profile) {
      if (body.profile.name !== undefined) {
        updateClauses.push('name = ?');
        updateValues.push(body.profile.name);
      }
      if (body.profile.languages !== undefined) {
        updateClauses.push('languages = ?');
        updateValues.push(JSON.stringify(body.profile.languages));
      }
      if (body.profile.frameworks !== undefined) {
        updateClauses.push('frameworks = ?');
        updateValues.push(JSON.stringify(body.profile.frameworks));
      }
      if (body.profile.tools !== undefined) {
        updateClauses.push('tools = ?');
        updateValues.push(JSON.stringify(body.profile.tools));
      }
      if (body.profile.topics !== undefined) {
        updateClauses.push('topics = ?');
        updateValues.push(JSON.stringify(body.profile.topics));
      }
      if (body.profile.depth !== undefined) {
        updateClauses.push('depth = ?');
        updateValues.push(body.profile.depth);
      }
      if (body.profile.custom_focus !== undefined) {
        updateClauses.push('custom_focus = ?');
        updateValues.push(body.profile.custom_focus);
      }
    }

    updateValues.push(profileId);

    await DB.prepare(
      `UPDATE profiles SET ${updateClauses.join(', ')} WHERE id = ?`
    ).bind(...updateValues).run();

    return new Response(JSON.stringify({
      success: true,
      diffs_hash: body.diffs_hash,
      stars_hash: body.stars_hash,
      synced: {
        diffs: body.diffs?.length || 0,
        stars: body.stars?.length || 0,
        deleted_diffs: body.deleted_diff_ids?.length || 0,
        deleted_stars: body.deleted_star_ids?.length || 0
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    console.error('Sync error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// GET to check if sync is needed (compare hashes)
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { DB } = context.env;
  const profileId = context.params.id as string;

  try {
    const url = new URL(context.request.url);
    const clientDiffsHash = url.searchParams.get('diffs_hash');
    const clientStarsHash = url.searchParams.get('stars_hash');

    // Public endpoint - just returns whether sync is needed
    const profile = await DB.prepare(
      'SELECT diffs_hash, stars_hash, content_updated_at FROM profiles WHERE id = ?'
    ).bind(profileId).first<{ diffs_hash: string | null; stars_hash: string | null; content_updated_at: string | null }>();

    if (!profile) {
      return new Response(JSON.stringify({ error: 'Profile not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const diffsSyncNeeded = !clientDiffsHash || clientDiffsHash !== profile.diffs_hash;
    const starsSyncNeeded = !clientStarsHash || clientStarsHash !== profile.stars_hash;

    // Append Z to timestamp so JS parses as UTC
    const serverUpdatedAt = profile.content_updated_at
      ? profile.content_updated_at.replace(' ', 'T') + 'Z'
      : null;

    return new Response(JSON.stringify({
      needs_sync: diffsSyncNeeded || starsSyncNeeded,
      diffs_sync_needed: diffsSyncNeeded,
      stars_sync_needed: starsSyncNeeded,
      server_diffs_hash: profile.diffs_hash,
      server_stars_hash: profile.stars_hash,
      server_updated_at: serverUpdatedAt
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    console.error('Sync check error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
