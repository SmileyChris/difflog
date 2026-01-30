/**
 * Stripe webhook handler for payment events
 * POST /api/purchase/webhook
 */

interface Env {
  DB: D1Database;
  STRIPE_WEBHOOK_SECRET: string;
}

interface StripePaymentIntent {
  id: string;
  customer?: string;
  metadata?: {
    email?: string;
    creds?: string;
    pack?: string;
  };
}

interface StripeEvent {
  id: string;
  type: string;
  data: {
    object: StripePaymentIntent;
  };
}

async function verifySignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const parts = signature.split(',').reduce((acc, part) => {
    const [key, value] = part.split('=');
    acc[key] = value;
    return acc;
  }, {} as Record<string, string>);

  const timestamp = parts['t'];
  const expectedSig = parts['v1'];

  if (!timestamp || !expectedSig) {
    return false;
  }

  // Check timestamp is within 5 minutes
  const timestampAge = Math.abs(Date.now() / 1000 - parseInt(timestamp));
  if (timestampAge > 300) {
    return false;
  }

  // Compute expected signature
  const signedPayload = `${timestamp}.${payload}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signatureBytes = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(signedPayload)
  );

  const computedSig = Array.from(new Uint8Array(signatureBytes))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return computedSig === expectedSig;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { DB, STRIPE_WEBHOOK_SECRET } = context.env;

  if (!STRIPE_WEBHOOK_SECRET) {
    console.error('STRIPE_WEBHOOK_SECRET not configured');
    return new Response('Webhook not configured', { status: 500 });
  }

  try {
    const payload = await context.request.text();
    const signature = context.request.headers.get('stripe-signature');

    if (!signature) {
      return new Response('Missing signature', { status: 400 });
    }

    const isValid = await verifySignature(payload, signature, STRIPE_WEBHOOK_SECRET);
    if (!isValid) {
      console.error('Invalid webhook signature');
      return new Response('Invalid signature', { status: 400 });
    }

    const event: StripeEvent = JSON.parse(payload);

    if (event.type === 'payment_intent.succeeded') {
      const pi = event.data.object;
      const email = pi.metadata?.email;
      const creds = parseInt(pi.metadata?.creds || '0');
      const pack = pi.metadata?.pack || 'unknown';

      if (!email || !creds) {
        console.error('Missing metadata in payment intent:', pi.id);
        return new Response('Missing metadata', { status: 400 });
      }

      console.log(`Payment succeeded: ${email} gets ${creds} creds (PI: ${pi.id})`);

      // Get or create account
      let account = await DB.prepare(
        'SELECT id, creds FROM accounts WHERE email = ?'
      ).bind(email).first<{ id: string; creds: number }>();

      if (!account) {
        // Create account
        const accountId = crypto.randomUUID();
        await DB.prepare(`
          INSERT INTO accounts (id, email, creds, stripe_customer_id, created_at, updated_at)
          VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
        `).bind(accountId, email, creds, pi.customer || null).run();

        account = { id: accountId, creds };
      } else {
        // Update existing account
        const newBalance = account.creds + creds;
        await DB.prepare(`
          UPDATE accounts SET creds = ?, updated_at = datetime('now') WHERE id = ?
        `).bind(newBalance, account.id).run();

        account.creds = newBalance;
      }

      // Log transaction
      await DB.prepare(`
        INSERT INTO transactions (id, account_id, type, amount, balance_after, description, stripe_payment_id, created_at)
        VALUES (?, ?, 'purchase', ?, ?, ?, ?, datetime('now'))
      `).bind(
        crypto.randomUUID(),
        account.id,
        creds,
        account.creds,
        pack === 'starter' ? 'Purchased starter pack' : 'Purchased best value pack',
        pi.id
      ).run();

      return new Response('OK', { status: 200 });
    }

    // Acknowledge other events
    return new Response('OK', { status: 200 });
  } catch (e) {
    console.error('Webhook error:', e);
    return new Response('Webhook handler failed', { status: 500 });
  }
};
