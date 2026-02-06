/**
 * Lightweight LLM abstraction for cheap/fast tasks (curation, classification)
 * Prefers DeepSeek/Gemini when available, falls back to Anthropic Haiku
 */

import type { ApiKeys } from './sync';

export interface JsonSchema {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
}

interface CompletionOptions {
  maxTokens?: number;
}

// Anthropic API response types
interface AnthropicContentBlock {
  type: string;
  text?: string;
  input?: unknown;
}

interface AnthropicToolUseBlock extends AnthropicContentBlock {
  type: 'tool_use';
  input: unknown;
}

interface AnthropicUsage {
  input_tokens: number;
  output_tokens: number;
}

interface AnthropicResponse {
  content?: AnthropicContentBlock[];
  stop_reason?: string;
  usage?: AnthropicUsage;
}

/**
 * Get a JSON completion from the cheapest available LLM
 * Priority: DeepSeek > Gemini > Anthropic Haiku
 */
export async function completeJson<T>(
  keys: ApiKeys,
  prompt: string,
  schema: JsonSchema,
  options: CompletionOptions = {}
): Promise<T | null> {
  const { maxTokens = 1024 } = options;

  // Try DeepSeek first (cheapest)
  if (keys.deepseek) {
    const result = await completeWithDeepSeek<T>(keys.deepseek, prompt, schema, maxTokens);
    if (result !== null) return result;
  }

  // Try Gemini second
  if (keys.gemini) {
    const result = await completeWithGemini<T>(keys.gemini, prompt, schema, maxTokens);
    if (result !== null) return result;
  }

  // Fall back to Anthropic Haiku
  if (keys.anthropic) {
    return completeWithAnthropic<T>(keys.anthropic, prompt, schema, maxTokens);
  }

  return null;
}

/**
 * DeepSeek API (OpenAI-compatible)
 */
async function completeWithDeepSeek<T>(
  apiKey: string,
  prompt: string,
  schema: JsonSchema,
  maxTokens: number
): Promise<T | null> {
  try {
    const res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `Respond with valid JSON matching this schema: ${JSON.stringify(schema)}`
          },
          { role: 'user', content: prompt }
        ],
      }),
    });

    if (!res.ok) {
      console.warn(`DeepSeek API error: ${res.status}`);
      return null;
    }

    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;

    return JSON.parse(content) as T;
  } catch (e) {
    console.warn('DeepSeek completion error:', e);
    return null;
  }
}

/**
 * Google Gemini API
 */
async function completeWithGemini<T>(
  apiKey: string,
  prompt: string,
  schema: JsonSchema,
  maxTokens: number
): Promise<T | null> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: maxTokens,
            responseMimeType: 'application/json',
            responseSchema: schema,
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      }
    );

    if (!res.ok) {
      console.warn(`Gemini API error: ${res.status}`);
      return null;
    }

    const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) return null;

    return JSON.parse(content) as T;
  } catch (e) {
    console.warn('Gemini completion error:', e);
    return null;
  }
}

/**
 * Anthropic API with tool_choice for structured output
 */
async function completeWithAnthropic<T>(
  apiKey: string,
  prompt: string,
  schema: JsonSchema,
  maxTokens: number
): Promise<T | null> {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
        tools: [{
          name: 'submit_result',
          description: 'Submit the result',
          input_schema: schema,
        }],
        tool_choice: { type: 'tool', name: 'submit_result' },
      }),
    });

    if (!res.ok) {
      console.warn(`Anthropic API error: ${res.status}`);
      return null;
    }

    const data = (await res.json()) as AnthropicResponse;
    const toolUse = data.content?.find((b): b is AnthropicToolUseBlock => b.type === 'tool_use');
    if (!toolUse?.input) return null;

    return toolUse.input as T;
  } catch (e) {
    console.warn('Anthropic completion error:', e);
    return null;
  }
}

// ============================================================================
// Diff Synthesis
// ============================================================================

export interface DiffResult {
  title: string;
  content: string;
  cost?: number;
}

interface DiffSchema {
  type: 'object';
  properties: {
    title: { type: 'string'; description: string };
    content: { type: 'string'; description: string };
  };
  required: ['title', 'content'];
}

const DIFF_SCHEMA: DiffSchema = {
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
};

/**
 * Synthesize a diff using the specified provider
 */
export async function synthesizeDiff(
  keys: ApiKeys,
  provider: string | null,
  prompt: string,
  maxTokens: number = 8192
): Promise<DiffResult> {
  // Default to anthropic if no provider specified
  const selectedProvider = provider || 'anthropic';

  switch (selectedProvider) {
    case 'deepseek':
      if (!keys.deepseek) throw new Error('DeepSeek API key not configured');
      return synthesizeWithDeepSeek(keys.deepseek, prompt, maxTokens);

    case 'gemini':
      if (!keys.gemini) throw new Error('Gemini API key not configured');
      return synthesizeWithGemini(keys.gemini, prompt, maxTokens);

    case 'perplexity':
      if (!keys.perplexity) throw new Error('Perplexity API key not configured');
      return synthesizeWithPerplexity(keys.perplexity, prompt, maxTokens);

    case 'anthropic':
    default:
      if (!keys.anthropic) throw new Error('Anthropic API key not configured');
      return synthesizeWithAnthropic(keys.anthropic, prompt, maxTokens);
  }
}

/**
 * Anthropic synthesis using Claude Sonnet with tool_choice
 */
async function synthesizeWithAnthropic(
  apiKey: string,
  prompt: string,
  maxTokens: number
): Promise<DiffResult> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
      tools: [{
        name: 'submit_diff',
        description: 'Submit the generated developer intelligence diff',
        input_schema: DIFF_SCHEMA,
      }],
      tool_choice: { type: 'tool', name: 'submit_diff' },
    }),
  });

  if (!res.ok) {
    const err = (await res.json()) as { error?: { message?: string } };
    throw new Error(err.error?.message || `Anthropic API error: ${res.status}`);
  }

  const result = (await res.json()) as AnthropicResponse;

  if (result.stop_reason === 'max_tokens') {
    throw new Error('Response truncated: the diff exceeded the token limit. Try a shallower depth setting.');
  }

  const toolUse = result.content?.find((b): b is AnthropicToolUseBlock => b.type === 'tool_use');
  const input = toolUse?.input as { title?: string; content?: string } | undefined;
  if (!input?.content) {
    throw new Error('No content returned from Anthropic API');
  }

  // Calculate cost (Claude Sonnet 4.5: $3/1M input, $15/1M output)
  const usage = result.usage;
  const cost = usage
    ? (usage.input_tokens * 3 + usage.output_tokens * 15) / 1_000_000
    : undefined;

  return {
    title: input.title || '',
    content: input.content,
    cost,
  };
}

/**
 * DeepSeek synthesis using deepseek-chat with JSON mode
 */
async function synthesizeWithDeepSeek(
  apiKey: string,
  prompt: string,
  maxTokens: number
): Promise<DiffResult> {
  const systemPrompt = `You are a developer intelligence reporter. Respond with valid JSON matching this schema:
${JSON.stringify(DIFF_SCHEMA, null, 2)}

The title should be 3-8 words capturing the main theme.
The content should be full markdown starting with the Intelligence Window date line.`;

  const res = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
    }),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(err.error?.message || `DeepSeek API error: ${res.status}`);
  }

  const result = (await res.json()) as {
    choices?: { finish_reason?: string; message?: { content?: string } }[];
    usage?: { prompt_tokens: number; completion_tokens: number };
  };

  if (result.choices?.[0]?.finish_reason === 'length') {
    throw new Error('Response truncated: the diff exceeded the token limit. Try a shallower depth setting.');
  }

  const content = result.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('No content returned from DeepSeek API');
  }

  const parsed = JSON.parse(content);
  if (!parsed.content) {
    throw new Error('Invalid response format from DeepSeek API');
  }

  // Calculate cost (DeepSeek: $0.14/1M input, $0.28/1M output)
  const usage = result.usage;
  const cost = usage
    ? (usage.prompt_tokens * 0.14 + usage.completion_tokens * 0.28) / 1_000_000
    : undefined;

  return {
    title: parsed.title || '',
    content: parsed.content,
    cost,
  };
}

/**
 * Gemini synthesis using gemini-2.5-flash with JSON schema
 */
async function synthesizeWithGemini(
  apiKey: string,
  prompt: string,
  maxTokens: number
): Promise<DiffResult> {
  const thinkingBudget = 8192;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: maxTokens + thinkingBudget,
          responseMimeType: 'application/json',
          responseSchema: DIFF_SCHEMA,
          thinkingConfig: { thinkingBudget: thinkingBudget },
        },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string; status?: string } };
    if (res.status === 429 || err.error?.status === 'RESOURCE_EXHAUSTED') {
      throw new Error('Gemini rate limit or quota exceeded. Check your plan at ai.google.dev or switch synthesis provider.');
    }
    throw new Error(err.error?.message || `Gemini API error: ${res.status}`);
  }

  const result = (await res.json()) as {
    candidates?: { finishReason?: string; content?: { parts?: { text?: string }[] } }[];
    usageMetadata?: { promptTokenCount: number; candidatesTokenCount: number };
  };

  const finishReason = result.candidates?.[0]?.finishReason;
  if (finishReason === 'MAX_TOKENS') {
    throw new Error('Response truncated: the diff exceeded the token limit. Try a shallower depth setting.');
  }

  const content = result.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) {
    throw new Error('No content returned from Gemini API');
  }

  const parsed = JSON.parse(content);
  if (!parsed.content) {
    throw new Error('Invalid response format from Gemini API');
  }

  // Calculate cost (Gemini 2.0 Flash: $0.10/1M input, $0.40/1M output)
  const usage = result.usageMetadata;
  const cost = usage
    ? (usage.promptTokenCount * 0.10 + usage.candidatesTokenCount * 0.40) / 1_000_000
    : undefined;

  return {
    title: parsed.title || '',
    content: parsed.content,
    cost,
  };
}

/**
 * Perplexity synthesis using sonar-pro
 */
async function synthesizeWithPerplexity(
  apiKey: string,
  prompt: string,
  maxTokens: number
): Promise<DiffResult> {
  const systemPrompt = `You are a developer intelligence reporter. Respond with valid JSON matching this schema:
${JSON.stringify(DIFF_SCHEMA, null, 2)}

The title should be 3-8 words capturing the main theme.
The content should be full markdown starting with the Intelligence Window date line.`;

  const res = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'sonar-pro',
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
    }),
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(err.error?.message || `Perplexity API error: ${res.status}`);
  }

  const result = (await res.json()) as {
    choices?: { finish_reason?: string; message?: { content?: string } }[];
    usage?: { prompt_tokens: number; completion_tokens: number };
  };

  if (result.choices?.[0]?.finish_reason === 'length') {
    throw new Error('Response truncated: the diff exceeded the token limit. Try a shallower depth setting.');
  }

  const content = result.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('No content returned from Perplexity API');
  }

  // Perplexity may return markdown-wrapped JSON, try to extract it
  let jsonContent = content;
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonContent = jsonMatch[1].trim();
  }

  const parsed = JSON.parse(jsonContent);
  if (!parsed.content) {
    throw new Error('Invalid response format from Perplexity API');
  }

  // Calculate cost (Perplexity sonar-pro: $3/1M input, $15/1M output)
  const usage = result.usage;
  const cost = usage
    ? (usage.prompt_tokens * 3 + usage.completion_tokens * 15) / 1_000_000
    : undefined;

  return {
    title: parsed.title || '',
    content: parsed.content,
    cost,
  };
}
