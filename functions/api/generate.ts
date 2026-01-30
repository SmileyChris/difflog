/**
 * Server-side generation for creds mode
 * POST /api/generate
 */

interface Env {
  DB: D1Database;
  ANTHROPIC_API_KEY: string;
}

interface GenerateRequest {
  email: string;
  code: string;
  prompt: string;
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
  const { DB, ANTHROPIC_API_KEY } = context.env;

  if (!ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: 'API not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await context.request.json() as GenerateRequest;
    const { email, code, prompt } = body;

    if (!email || !code || !prompt) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
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

    // Get account and check creds
    const account = await DB.prepare(
      'SELECT id, creds FROM accounts WHERE email = ?'
    ).bind(email).first<{ id: string; creds: number }>();

    if (!account) {
      return new Response(JSON.stringify({ error: 'Account not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (account.creds < 1) {
      return new Response(JSON.stringify({ error: 'Insufficient creds' }), {
        status: 402,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Call Anthropic API
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
        tools: [{
          name: 'submit_diff',
          description: 'Submit the generated developer intelligence diff',
          input_schema: {
            type: 'object',
            properties: {
              title: {
                type: 'string',
                description: 'A short, creative title (3-8 words) capturing the main theme of this diff. Plain text, no markdown.'
              },
              content: {
                type: 'string',
                description: 'The full markdown content of the diff, starting with the date line'
              }
            },
            required: ['title', 'content']
          }
        }],
        tool_choice: { type: 'tool', name: 'submit_diff' }
      }),
    });

    if (!res.ok) {
      const err = await res.json() as { error?: { message?: string } };
      console.error('Anthropic API error:', err);
      return new Response(JSON.stringify({ error: err.error?.message || 'API error' }), {
        status: res.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const result = await res.json() as {
      content: Array<{ type: string; input?: { title?: string; content?: string } }>;
      usage?: { input_tokens: number; output_tokens: number };
    };

    const toolUse = result.content.find(b => b.type === 'tool_use');
    if (!toolUse?.input?.content) {
      return new Response(JSON.stringify({ error: 'No content returned from API' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Deduct cred and log transaction
    const newBalance = account.creds - 1;
    await DB.prepare(
      'UPDATE accounts SET creds = ?, updated_at = datetime(\'now\') WHERE id = ?'
    ).bind(newBalance, account.id).run();

    await DB.prepare(`
      INSERT INTO transactions (id, account_id, type, amount, balance_after, description, created_at)
      VALUES (?, ?, 'usage', -1, ?, 'Generated diff', datetime('now'))
    `).bind(crypto.randomUUID(), account.id, newBalance).run();

    const diffId = crypto.randomUUID();
    const title = toolUse.input.title || '';
    const content = toolUse.input.content;

    // Save diff server-side so user can recover it if they disconnect
    await DB.prepare(`
      INSERT INTO pending_diffs (id, account_id, title, content, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `).bind(diffId, account.id, title, content).run();

    // Return result
    return new Response(JSON.stringify({
      id: diffId,
      title,
      content,
      usage: result.usage,
      creds: newBalance
    }), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (e) {
    console.error('Generate error:', e);
    return new Response(JSON.stringify({ error: 'Generation failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
