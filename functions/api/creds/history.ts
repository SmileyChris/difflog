/**
 * Get credit history for a user
 * GET /api/creds/history?email=xxx&code=xxx&filter=topups|usage
 */

interface Env {
  DB: D1Database;
}

interface Transaction {
  id: string;
  type: string;
  amount: number;
  balance_after: number;
  description: string;
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

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { DB } = context.env;
  const url = new URL(context.request.url);
  const email = url.searchParams.get('email');
  const code = url.searchParams.get('code');
  const filter = url.searchParams.get('filter') || 'topups';

  if (!email || !code) {
    return new Response(JSON.stringify({ error: 'Email and code required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Verify the code
  const expectedCode = await generateCode(email);
  if (code !== expectedCode) {
    return new Response(JSON.stringify({ error: 'Invalid credentials' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // Get account
    const account = await DB.prepare(
      'SELECT id, creds FROM accounts WHERE email = ?'
    ).bind(email).first<{ id: string; creds: number }>();

    if (!account) {
      return new Response(JSON.stringify({ transactions: [], creds: 0 }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get transactions based on filter
    const typeFilter = filter === 'usage' ? "type = 'usage'" : "type IN ('purchase', 'bonus')";
    const result = await DB.prepare(`
      SELECT id, type, amount, balance_after, description, created_at
      FROM transactions
      WHERE account_id = ? AND ${typeFilter}
      ORDER BY created_at DESC
      LIMIT 50
    `).bind(account.id).all<Transaction>();

    return new Response(JSON.stringify({
      transactions: result.results || [],
      creds: account.creds
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('Failed to fetch history:', e);
    return new Response(JSON.stringify({ error: 'Failed to fetch history' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
