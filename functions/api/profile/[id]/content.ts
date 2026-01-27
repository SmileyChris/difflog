/**
 * POST /api/profile/[id]/content
 * Download encrypted diffs and stars for a profile
 * Requires password authentication
 */

import type { Env, ProfileRow, ContentRequest, ContentResponse } from '../../../types';
import { verifyPassword, resetFailedAttempts } from '../../../lib/auth';

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { DB } = context.env;
  const profileId = context.params.id as string;

  try {
    const body: ContentRequest = await context.request.json();

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

    // Reset failed attempts on success
    await resetFailedAttempts(DB, profileId);

    // Fetch all encrypted diffs and stars
    const diffsResult = await DB.prepare(
      'SELECT id, encrypted_data FROM diffs WHERE profile_id = ?'
    ).bind(profileId).all<{ id: string; encrypted_data: string }>();

    const starsResult = await DB.prepare(
      'SELECT id, encrypted_data FROM stars WHERE profile_id = ?'
    ).bind(profileId).all<{ id: string; encrypted_data: string }>();

    const response: ContentResponse = {
      diffs: diffsResult.results || [],
      stars: starsResult.results || [],
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
        custom_focus: profile.custom_focus,
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
