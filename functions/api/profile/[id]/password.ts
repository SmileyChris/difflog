/**
 * POST /api/profile/[id]/password
 * Update sync password - re-encrypts all data with new password
 */

import type { Env, ProfileRow } from '../../../types';
import { verifyPassword } from '../../../lib/auth';

interface PasswordUpdateRequest {
  old_password_hash: string;
  new_password_hash: string;
  new_encrypted_api_key: string;
  new_salt: string;
  diffs: { id: string; encrypted_data: string }[];
  stars: { id: string; encrypted_data: string }[];
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { DB } = context.env;
  const profileId = context.params.id as string;

  try {
    const body: PasswordUpdateRequest = await context.request.json();

    if (!body.old_password_hash || !body.new_password_hash) {
      return new Response(JSON.stringify({ error: 'Both old and new passwords required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!body.new_encrypted_api_key || !body.new_salt) {
      return new Response(JSON.stringify({ error: 'New encrypted API key and salt required' }), {
        status: 400,
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

    // Verify old password with rate limiting
    const authError = await verifyPassword(DB, profile, profileId, body.old_password_hash);
    if (authError) return authError;

    // Build batch statements for atomic update
    const statements: D1PreparedStatement[] = [];

    // Delete all existing diffs for this profile
    statements.push(
      DB.prepare('DELETE FROM diffs WHERE profile_id = ?').bind(profileId)
    );

    // Delete all existing stars for this profile
    statements.push(
      DB.prepare('DELETE FROM stars WHERE profile_id = ?').bind(profileId)
    );

    // Insert new encrypted diffs
    if (body.diffs && body.diffs.length > 0) {
      for (const diff of body.diffs) {
        statements.push(
          DB.prepare(`
            INSERT INTO diffs (id, profile_id, encrypted_data)
            VALUES (?, ?, ?)
          `).bind(diff.id, profileId, diff.encrypted_data)
        );
      }
    }

    // Insert new encrypted stars
    if (body.stars && body.stars.length > 0) {
      for (const star of body.stars) {
        statements.push(
          DB.prepare(`
            INSERT INTO stars (id, profile_id, encrypted_data)
            VALUES (?, ?, ?)
          `).bind(star.id, profileId, star.encrypted_data)
        );
      }
    }

    // Update profile with new password hash, salt, encrypted API key
    statements.push(
      DB.prepare(`
        UPDATE profiles
        SET password_hash = ?,
            salt = ?,
            encrypted_api_key = ?,
            failed_attempts = 0,
            lockout_until = NULL,
            content_updated_at = datetime('now'),
            updated_at = datetime('now')
        WHERE id = ?
      `).bind(body.new_password_hash, body.new_salt, body.new_encrypted_api_key, profileId)
    );

    // Execute all statements atomically
    await DB.batch(statements);

    return new Response(JSON.stringify({
      success: true,
      message: 'Password updated successfully'
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    console.error('Password update error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
