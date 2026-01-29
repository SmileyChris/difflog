/**
 * GET /api/diff/[id]/public
 * Serve a public (unencrypted) diff with long cache headers
 *
 * Public diffs are detected by checking if encrypted_data is valid JSON
 * (starts with '{'), vs encrypted data which is a base64 blob.
 */

import type { Env, EncryptedDiffRow, ProfileRow } from '../../../types';

interface PublicDiffResponse {
  id: string;
  content: string;
  title?: string;
  generated_at: string;
  profile_name: string;
}

function isPublicDiff(encryptedData: string): boolean {
  return encryptedData.startsWith('{');
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { DB } = context.env;
  const diffId = context.params.id as string;

  try {
    // Fetch the diff
    const diff = await DB.prepare(
      'SELECT id, profile_id, encrypted_data FROM diffs WHERE id = ?'
    ).bind(diffId).first<EncryptedDiffRow>();

    if (!diff) {
      return new Response(JSON.stringify({ error: 'Diff not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check if diff is public (plaintext JSON vs encrypted base64)
    if (!isPublicDiff(diff.encrypted_data)) {
      return new Response(JSON.stringify({ error: 'Diff not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Parse the plaintext JSON content
    let diffData: { content: string; title?: string; generated_at: string };
    try {
      diffData = JSON.parse(diff.encrypted_data);
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid diff data' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get profile name
    const profile = await DB.prepare(
      'SELECT name FROM profiles WHERE id = ?'
    ).bind(diff.profile_id).first<Pick<ProfileRow, 'name'>>();

    const response: PublicDiffResponse = {
      id: diff.id,
      content: diffData.content,
      title: diffData.title,
      generated_at: diffData.generated_at,
      profile_name: profile?.name || 'Anonymous'
    };

    return new Response(JSON.stringify(response), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=86400',
        'Cache-Tag': `diff-${diffId}`
      }
    });
  } catch (error: any) {
    console.error('Public diff fetch error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
