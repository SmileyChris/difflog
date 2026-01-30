/**
 * Fetch and claim pending diffs for a user
 * POST /api/creds/pending
 * Body: { email, code, claim: [id, ...] }
 *
 * Returns pending diffs. If claim array provided, deletes those diffs after returning.
 */

interface Env {
  DB: D1Database;
}

interface PendingRequest {
  email: string;
  code: string;
  claim?: string[];
}

interface PendingDiff {
  id: string;
  title: string;
  content: string;
  created_at: string;
}

const DEV_SECRET = 'difflog-dev-secret';

async function generateCode(email: string): Promise<string> {
  const data = new TextEncoder().encode(email + DEV_SECRET);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const arr = new Uint8Array(hash);
  const num = (arr[0] << 24 | arr[1] << 16 | arr[2] << 8 | arr[3]) >>> 0;
  return String(num % 1000000).padStart(6, '0');
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { DB } = context.env;

  try {
    const body = await context.request.json() as PendingRequest;
    const { email, code, claim } = body;

    if (!email || !code) {
      return new Response(JSON.stringify({ error: 'Email and code required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Verify credentials
    const expectedCode = await generateCode(email);
    if (code !== expectedCode) {
      return new Response(JSON.stringify({ error: 'Invalid credentials' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get account
    const account = await DB.prepare(
      'SELECT id FROM accounts WHERE email = ?'
    ).bind(email).first<{ id: string }>();

    if (!account) {
      return new Response(JSON.stringify({ diffs: [] }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Claim (delete) specified diffs
    if (claim && claim.length > 0) {
      const placeholders = claim.map(() => '?').join(',');
      await DB.prepare(`
        DELETE FROM pending_diffs
        WHERE account_id = ? AND id IN (${placeholders})
      `).bind(account.id, ...claim).run();
    }

    // Fetch remaining pending diffs
    const result = await DB.prepare(`
      SELECT id, title, content, created_at
      FROM pending_diffs
      WHERE account_id = ?
      ORDER BY created_at DESC
      LIMIT 10
    `).bind(account.id).all<PendingDiff>();

    return new Response(JSON.stringify({ diffs: result.results || [] }), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (e) {
    console.error('Pending diffs error:', e);
    return new Response(JSON.stringify({ error: 'Failed to fetch pending diffs' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
