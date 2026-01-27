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
    const data = await res.json().catch(() => ({}));
    const retryAfter = data.retry_after_seconds;
    throw new ApiError(
      `Too many attempts. Try again in ${Math.ceil((retryAfter || 60) / 60)} minutes.`,
      429,
      retryAfter
    );
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    let message = data.error || `Request failed: ${res.status}`;
    // Include remaining attempts for 401 errors
    if (res.status === 401 && typeof data.attempts_remaining === 'number') {
      message = `Invalid password (${data.attempts_remaining} attempts remaining)`;
    }
    throw new ApiError(message, res.status);
  }

  return res.json();
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
 * Validate API key against Anthropic
 */
export async function validateApiKey(apiKey: string): Promise<boolean> {
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
