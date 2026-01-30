/**
 * Request email verification code for creds
 * POST /api/creds/request
 * Body: { email: string }
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
    const body = await context.request.json() as { email: string };

    if (!body.email || typeof body.email !== 'string') {
      return new Response(JSON.stringify({ error: 'Email is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const code = await generateCode(body.email);

    // Log to console for dev testing
    console.log(`\n📧 [Mock Email] Verification code for ${body.email}: ${code}\n`);

    // In production, this would send an actual email via SES/Resend/etc.

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Failed to send verification code' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
