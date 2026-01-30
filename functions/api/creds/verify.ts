/**
 * Verify email code and grant creds
 * POST /api/creds/verify
 * Body: { email: string, code: string }
 */

interface Env {
  DB: D1Database;
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
  try {
    const body = await context.request.json() as { email: string; code: string };

    if (!body.email || !body.code) {
      return new Response(JSON.stringify({ error: 'Email and code are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const expectedCode = await generateCode(body.email);

    if (body.code !== expectedCode) {
      return new Response(JSON.stringify({ error: 'Invalid verification code' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { DB } = context.env;

    // Check if user already exists
    let account = await DB.prepare(
      'SELECT id, creds FROM accounts WHERE email = ?'
    ).bind(body.email).first<{ id: string; creds: number }>();

    if (account) {
      // Existing user - return current balance
      return new Response(JSON.stringify({ success: true, creds: account.creds }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // New user - create account with 5 free creds
    const SIGNUP_BONUS = 5;
    const accountId = crypto.randomUUID();

    await DB.prepare(`
      INSERT INTO accounts (id, email, creds, created_at, updated_at)
      VALUES (?, ?, ?, datetime('now'), datetime('now'))
    `).bind(accountId, body.email, SIGNUP_BONUS).run();

    // Log the signup bonus transaction
    await DB.prepare(`
      INSERT INTO transactions (id, account_id, type, amount, balance_after, description, created_at)
      VALUES (?, ?, 'bonus', ?, ?, ?, datetime('now'))
    `).bind(
      crypto.randomUUID(),
      accountId,
      SIGNUP_BONUS,
      SIGNUP_BONUS,
      'Signup bonus'
    ).run();

    console.log(`✅ Created account for ${body.email} with ${SIGNUP_BONUS} free creds`);

    return new Response(JSON.stringify({ success: true, creds: SIGNUP_BONUS }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Verification failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
