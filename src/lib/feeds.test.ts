import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test';
import { getUnmappedItems, resolveSourcesForItem, type UnmappedItem } from './feeds';
import type { ResolvedMapping } from './sync';

// Mock profile type for testing
interface TestProfile {
  languages: string[];
  frameworks: string[];
  tools: string[];
  topics: string[];
  resolvedMappings?: Record<string, ResolvedMapping>;
}

describe('getUnmappedItems', () => {
  test('returns empty array when all items have predefined mappings', () => {
    const profile: TestProfile = {
      languages: ['JavaScript', 'Python'],
      frameworks: ['React', 'Django'],
      tools: ['Docker'],
      topics: ['AI/ML & LLMs'],
    };

    const unmapped = getUnmappedItems(profile as any);
    expect(unmapped).toEqual([]);
  });

  test('detects unmapped language', () => {
    const profile: TestProfile = {
      languages: ['JavaScript', 'Zig'], // Zig has no predefined mapping
      frameworks: [],
      tools: [],
      topics: [],
    };

    const unmapped = getUnmappedItems(profile as any);
    expect(unmapped).toEqual([{ item: 'Zig', category: 'language' }]);
  });

  test('detects unmapped framework', () => {
    const profile: TestProfile = {
      languages: [],
      frameworks: ['React', 'Remix'], // Remix has no predefined mapping
      tools: [],
      topics: [],
    };

    const unmapped = getUnmappedItems(profile as any);
    expect(unmapped).toEqual([{ item: 'Remix', category: 'framework' }]);
  });

  test('detects unmapped tool', () => {
    const profile: TestProfile = {
      languages: [],
      frameworks: [],
      tools: ['Docker', 'Nix'], // Nix has no predefined mapping
      topics: [],
    };

    const unmapped = getUnmappedItems(profile as any);
    expect(unmapped).toEqual([{ item: 'Nix', category: 'tool' }]);
  });

  test('detects unmapped topic', () => {
    const profile: TestProfile = {
      languages: [],
      frameworks: [],
      tools: [],
      topics: ['AI/ML & LLMs', 'Homelab'], // Homelab has no predefined mapping
    };

    const unmapped = getUnmappedItems(profile as any);
    expect(unmapped).toEqual([{ item: 'Homelab', category: 'topic' }]);
  });

  test('detects multiple unmapped items across categories', () => {
    const profile: TestProfile = {
      languages: ['Zig'],
      frameworks: ['Remix'],
      tools: ['Nix'],
      topics: ['Homelab'],
    };

    const unmapped = getUnmappedItems(profile as any);
    expect(unmapped).toHaveLength(4);
    expect(unmapped).toContainEqual({ item: 'Zig', category: 'language' });
    expect(unmapped).toContainEqual({ item: 'Remix', category: 'framework' });
    expect(unmapped).toContainEqual({ item: 'Nix', category: 'tool' });
    expect(unmapped).toContainEqual({ item: 'Homelab', category: 'topic' });
  });

  test('excludes items that already have resolved mappings', () => {
    const profile: TestProfile = {
      languages: ['Zig'],
      frameworks: [],
      tools: [],
      topics: ['Homelab'],
      resolvedMappings: {
        'Zig': { subreddits: ['Zig'], lobstersTags: ['zig'], devtoTags: ['zig'] },
      },
    };

    const unmapped = getUnmappedItems(profile as any);
    expect(unmapped).toEqual([{ item: 'Homelab', category: 'topic' }]);
  });

  test('handles empty profile', () => {
    const profile: TestProfile = {
      languages: [],
      frameworks: [],
      tools: [],
      topics: [],
    };

    const unmapped = getUnmappedItems(profile as any);
    expect(unmapped).toEqual([]);
  });

  test('handles undefined arrays', () => {
    const profile = {
      languages: undefined,
      frameworks: undefined,
      tools: undefined,
      topics: undefined,
    };

    const unmapped = getUnmappedItems(profile as any);
    expect(unmapped).toEqual([]);
  });
});

describe('resolveSourcesForItem', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('returns resolved mapping from AI response', async () => {
    const mockResponse = {
      content: [{
        type: 'tool_use',
        name: 'submit_sources',
        input: {
          subreddits: ['selfhosted', 'homelab'],
          lobstersTags: ['selfhosted'],
          devtoTags: ['homelab', 'selfhosted'],
        },
      }],
    };

    globalThis.fetch = mock(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    })) as any;

    const result = await resolveSourcesForItem('test-api-key', 'Homelab', 'topic');

    expect(result).toEqual({
      subreddits: ['selfhosted', 'homelab'],
      lobstersTags: ['selfhosted'],
      devtoTags: ['homelab', 'selfhosted'],
    });
  });

  test('sends correct request to Anthropic API', async () => {
    let capturedRequest: any = null;

    globalThis.fetch = mock((url: string, options: any) => {
      capturedRequest = { url, options };
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          content: [{
            type: 'tool_use',
            input: { subreddits: [], lobstersTags: [], devtoTags: [] },
          }],
        }),
      });
    }) as any;

    await resolveSourcesForItem('test-api-key', 'Zig', 'language');

    expect(capturedRequest.url).toBe('https://api.anthropic.com/v1/messages');
    expect(capturedRequest.options.method).toBe('POST');
    expect(capturedRequest.options.headers['x-api-key']).toBe('test-api-key');

    const body = JSON.parse(capturedRequest.options.body);
    expect(body.model).toBe('claude-haiku-4-5');
    expect(body.tools[0].name).toBe('submit_sources');
    expect(body.tool_choice).toEqual({ type: 'tool', name: 'submit_sources' });
    expect(body.messages[0].content).toContain('language');
    expect(body.messages[0].content).toContain('Zig');
  });

  test('returns empty mapping on API error', async () => {
    globalThis.fetch = mock(() => Promise.resolve({
      ok: false,
      status: 500,
    })) as any;

    const result = await resolveSourcesForItem('test-api-key', 'Homelab', 'topic');

    expect(result).toEqual({
      subreddits: [],
      lobstersTags: [],
      devtoTags: [],
    });
  });

  test('returns empty mapping on network error', async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error('Network error'))) as any;

    const result = await resolveSourcesForItem('test-api-key', 'Homelab', 'topic');

    expect(result).toEqual({
      subreddits: [],
      lobstersTags: [],
      devtoTags: [],
    });
  });

  test('returns empty mapping when no tool_use in response', async () => {
    globalThis.fetch = mock(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        content: [{ type: 'text', text: 'Some text response' }],
      }),
    })) as any;

    const result = await resolveSourcesForItem('test-api-key', 'Homelab', 'topic');

    expect(result).toEqual({
      subreddits: [],
      lobstersTags: [],
      devtoTags: [],
    });
  });

  test('handles partial AI response gracefully', async () => {
    globalThis.fetch = mock(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        content: [{
          type: 'tool_use',
          input: {
            subreddits: ['homelab'],
            // lobstersTags and devtoTags missing
          },
        }],
      }),
    })) as any;

    const result = await resolveSourcesForItem('test-api-key', 'Homelab', 'topic');

    expect(result).toEqual({
      subreddits: ['homelab'],
      lobstersTags: [],
      devtoTags: [],
    });
  });
});

describe('resolved mappings integration', () => {
  test('workflow: detect unmapped -> resolve -> cache prevents re-resolution', async () => {
    // Step 1: Profile with unmapped item
    const profile: TestProfile = {
      languages: [],
      frameworks: [],
      tools: [],
      topics: ['Homelab'],
    };

    // Step 2: Detect unmapped
    const unmapped = getUnmappedItems(profile as any);
    expect(unmapped).toHaveLength(1);
    expect(unmapped[0].item).toBe('Homelab');

    // Step 3: Mock AI resolution
    globalThis.fetch = mock(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        content: [{
          type: 'tool_use',
          input: {
            subreddits: ['selfhosted', 'homelab'],
            lobstersTags: ['selfhosted'],
            devtoTags: ['homelab'],
          },
        }],
      }),
    })) as any;

    const resolved = await resolveSourcesForItem('key', 'Homelab', 'topic');

    // Step 4: Save to profile (simulating what dashboard does)
    profile.resolvedMappings = { 'Homelab': resolved };

    // Step 5: No longer unmapped
    const unmappedAfter = getUnmappedItems(profile as any);
    expect(unmappedAfter).toHaveLength(0);
  });

  test('empty resolution is still cached (prevents retry)', async () => {
    const profile: TestProfile = {
      languages: [],
      frameworks: [],
      tools: [],
      topics: ['ObscureTopic'],
      resolvedMappings: {
        'ObscureTopic': { subreddits: [], lobstersTags: [], devtoTags: [] },
      },
    };

    // Even with empty mapping, item should not be considered unmapped
    const unmapped = getUnmappedItems(profile as any);
    expect(unmapped).toHaveLength(0);
  });
});

// Import additional functions for testing
import { curateGeneralFeeds, searchWebForProfile, formatItemsForPrompt, formatWebSearchForPrompt, type FeedItem, type WebSearchResult } from './feeds';

describe('curateGeneralFeeds', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const sampleItems: FeedItem[] = [
    { title: 'New Rust feature released', url: 'https://example.com/1', source: 'HN', score: 100 },
    { title: 'Celebrity gossip news', url: 'https://example.com/2', source: 'HN', score: 50 },
    { title: 'React 19 announced', url: 'https://example.com/3', source: 'Lobsters', score: 80 },
    { title: 'Political debate summary', url: 'https://example.com/4', source: 'HN', score: 200 },
    { title: 'Docker security update', url: 'https://example.com/5', source: 'Lobsters', score: 60 },
  ];

  const profile: TestProfile = {
    languages: ['Rust', 'JavaScript'],
    frameworks: ['React'],
    tools: ['Docker'],
    topics: ['Security & Privacy'],
  };

  test('returns filtered items based on AI selection', async () => {
    globalThis.fetch = mock(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        content: [{
          type: 'tool_use',
          name: 'select_relevant',
          input: { indices: [0, 2, 4] }, // Rust, React, Docker items
        }],
      }),
    })) as any;

    const result = await curateGeneralFeeds('test-api-key', sampleItems, profile as any);

    expect(result).toHaveLength(3);
    expect(result[0].title).toBe('New Rust feature released');
    expect(result[1].title).toBe('React 19 announced');
    expect(result[2].title).toBe('Docker security update');
  });

  test('sends correct request to Anthropic API', async () => {
    let capturedRequest: any = null;

    globalThis.fetch = mock((url: string, options: any) => {
      capturedRequest = { url, options };
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          content: [{
            type: 'tool_use',
            input: { indices: [0] },
          }],
        }),
      });
    }) as any;

    await curateGeneralFeeds('test-api-key', sampleItems, profile as any);

    expect(capturedRequest.url).toBe('https://api.anthropic.com/v1/messages');
    expect(capturedRequest.options.method).toBe('POST');
    expect(capturedRequest.options.headers['x-api-key']).toBe('test-api-key');

    const body = JSON.parse(capturedRequest.options.body);
    expect(body.model).toBe('claude-haiku-4-5');
    expect(body.tools[0].name).toBe('select_relevant');
    expect(body.tool_choice).toEqual({ type: 'tool', name: 'select_relevant' });
    // Check that items are included with indices
    expect(body.messages[0].content).toContain('[0]');
    expect(body.messages[0].content).toContain('New Rust feature released');
    // Check profile is included
    expect(body.messages[0].content).toContain('Rust');
    expect(body.messages[0].content).toContain('React');
  });

  test('returns all items on API error (graceful degradation)', async () => {
    globalThis.fetch = mock(() => Promise.resolve({
      ok: false,
      status: 500,
    })) as any;

    const result = await curateGeneralFeeds('test-api-key', sampleItems, profile as any);

    expect(result).toEqual(sampleItems);
  });

  test('returns all items on network error', async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error('Network error'))) as any;

    const result = await curateGeneralFeeds('test-api-key', sampleItems, profile as any);

    expect(result).toEqual(sampleItems);
  });

  test('returns all items when no indices in response', async () => {
    globalThis.fetch = mock(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        content: [{ type: 'text', text: 'Some text' }],
      }),
    })) as any;

    const result = await curateGeneralFeeds('test-api-key', sampleItems, profile as any);

    expect(result).toEqual(sampleItems);
  });

  test('filters out invalid indices', async () => {
    globalThis.fetch = mock(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        content: [{
          type: 'tool_use',
          input: { indices: [0, 99, -1, 2] }, // 99 and -1 are invalid
        }],
      }),
    })) as any;

    const result = await curateGeneralFeeds('test-api-key', sampleItems, profile as any);

    expect(result).toHaveLength(2);
    expect(result[0].title).toBe('New Rust feature released');
    expect(result[1].title).toBe('React 19 announced');
  });

  test('returns empty array for empty input', async () => {
    const result = await curateGeneralFeeds('test-api-key', [], profile as any);
    expect(result).toEqual([]);
  });
});

describe('formatItemsForPrompt', () => {
  test('formats items with header and unlinked source when no separate discussion', () => {
    const items: FeedItem[] = [
      { title: 'Test Article', url: 'https://example.com', source: 'HN', score: 100 },
    ];

    const result = formatItemsForPrompt(items);

    expect(result).toContain('## REAL-TIME FEED DATA');
    expect(result).toContain('100 HN pts');  // Source not linked when no separate discussionUrl
    expect(result).toContain('Test Article');
    expect(result).toContain('https://example.com');
  });

  test('uses discussionUrl for source link when available', () => {
    const items: FeedItem[] = [
      {
        title: 'Test Article',
        url: 'https://blog.com/post',
        discussionUrl: 'https://news.ycombinator.com/item?id=123',
        source: 'HN',
        score: 100
      },
    ];

    const result = formatItemsForPrompt(items);

    expect(result).toContain('[HN](https://news.ycombinator.com/item?id=123)');
    expect(result).toContain('https://blog.com/post');
  });

  test('returns empty string for empty array', () => {
    const result = formatItemsForPrompt([]);
    expect(result).toBe('');
  });
});

describe('searchWebForProfile', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const profile: TestProfile = {
    languages: ['Rust', 'TypeScript'],
    frameworks: ['React'],
    tools: ['Docker'],
    topics: ['AI/ML & LLMs'],
  };

  test('extracts items from structured text response', async () => {
    globalThis.fetch = mock(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        content: [{
          type: 'text',
          text: `Here are recent developer news items:

ITEM: "Rust 1.80 Released" | https://blog.rust-lang.org/1.80 | The Rust team announces version 1.80 with new features.
ITEM: "TypeScript 5.5 Features" | https://devblogs.microsoft.com/ts-5.5 | New features in TypeScript 5.5 include better inference.`,
        }],
      }),
    })) as any;

    const results = await searchWebForProfile('test-api-key', profile as any, 7);

    expect(results).toHaveLength(2);
    expect(results[0].title).toBe('Rust 1.80 Released');
    expect(results[0].url).toBe('https://blog.rust-lang.org/1.80');
    expect(results[0].snippet).toContain('Rust team');
  });

  test('extracts items from citations', async () => {
    globalThis.fetch = mock(() => Promise.resolve({
      ok: true,
      json: () => Promise.resolve({
        content: [{
          type: 'text',
          text: 'Found some news about Rust.',
          citations: [{
            type: 'web_search_result_location',
            url: 'https://blog.rust-lang.org/1.80',
            title: 'Rust 1.80 Released',
            cited_text: 'The Rust team is happy to announce...',
          }],
        }],
      }),
    })) as any;

    const results = await searchWebForProfile('test-api-key', profile as any, 7);

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].url).toBe('https://blog.rust-lang.org/1.80');
  });

  test('returns empty array on API error', async () => {
    globalThis.fetch = mock(() => Promise.resolve({
      ok: false,
      status: 500,
    })) as any;

    const results = await searchWebForProfile('test-api-key', profile as any, 7);

    expect(results).toEqual([]);
  });

  test('handles network errors gracefully', async () => {
    globalThis.fetch = mock(() => Promise.reject(new Error('Network error'))) as any;

    const results = await searchWebForProfile('test-api-key', profile as any, 7);

    expect(results).toEqual([]);
  });

  test('returns empty array for empty profile', async () => {
    const emptyProfile: TestProfile = {
      languages: [],
      frameworks: [],
      tools: [],
      topics: [],
    };

    const results = await searchWebForProfile('test-api-key', emptyProfile as any, 7);

    expect(results).toEqual([]);
  });
});

describe('formatWebSearchForPrompt', () => {
  test('formats web search results with header', () => {
    const results: WebSearchResult[] = [
      { title: 'Rust 1.80 Released', url: 'https://blog.rust-lang.org', snippet: 'New features...' },
    ];

    const formatted = formatWebSearchForPrompt(results);

    expect(formatted).toContain('## WEB SEARCH RESULTS');
    expect(formatted).toContain('Rust 1.80 Released');
    expect(formatted).toContain('https://blog.rust-lang.org');
    expect(formatted).toContain('New features...');
  });

  test('returns empty string for empty results', () => {
    const formatted = formatWebSearchForPrompt([]);
    expect(formatted).toBe('');
  });
});
