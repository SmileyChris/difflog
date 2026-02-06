/**
 * API Error with status code and optional retry information
 */
export class ApiError extends Error {
  status: number;
  retryAfter?: number;

  constructor(message: string, status: number, retryAfter?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

/**
 * Fetch JSON with standardized error handling
 */
export async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);

  if (res.status === 429) {
    const data = (await res.json().catch(() => ({}))) as { retry_after_seconds?: number };
    const retryAfter = data.retry_after_seconds;
    throw new ApiError(
      `Too many attempts. Try again in ${Math.ceil((retryAfter || 60) / 60)} minutes.`,
      429,
      retryAfter
    );
  }

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string; attempts_remaining?: number };
    let message = data.error || `Request failed: ${res.status}`;
    // Include remaining attempts for 401 errors
    if (res.status === 401 && typeof data.attempts_remaining === 'number') {
      message = `Invalid password (${data.attempts_remaining} attempts remaining)`;
    }
    throw new ApiError(message, res.status);
  }

  return res.json() as Promise<T>;
}

/**
 * POST JSON with standardized error handling
 */
export async function postJson<T>(url: string, body: unknown): Promise<T> {
  return fetchJson<T>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

/**
 * Validate Anthropic API key
 */
export async function validateAnthropicKey(apiKey: string): Promise<boolean> {
  try {
    const response = await fetch('https://api.anthropic.com/v1/models', {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Validate Serper.dev API key
 */
export async function validateSerperKey(apiKey: string): Promise<boolean> {
  try {
    const response = await fetch('https://google.serper.dev/news', {
      method: 'POST',
      headers: {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        q: 'test',
        num: 1,
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Validate DeepSeek API key (OpenAI-compatible API)
 */
export async function validateDeepSeekKey(apiKey: string): Promise<boolean> {
  try {
    const response = await fetch('https://api.deepseek.com/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Validate Google Gemini API key
 */
export async function validateGeminiKey(apiKey: string): Promise<boolean> {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`,
      { method: 'GET' }
    );
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Validate Perplexity API key
 */
export async function validatePerplexityKey(apiKey: string): Promise<boolean> {
  try {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 1,
      }),
    });
    // 200 = valid, 401 = invalid key, other errors might be rate limits
    return response.ok || response.status === 429;
  } catch {
    return false;
  }
}
