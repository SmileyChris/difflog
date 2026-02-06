// Web search providers - Serper (Google) with fallback to Anthropic's tool

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
}

interface SerperResult {
  title: string;
  link: string;
  snippet: string;
  date?: string;
}

interface SerperResponse {
  organic?: SerperResult[];
  news?: SerperResult[];
}

/**
 * Search using Serper.dev Google News API
 */
export async function searchWithSerper(
  apiKey: string,
  queries: string[],
  windowDays: number = 7
): Promise<WebSearchResult[]> {
  // Map window days to Google's tbs parameter
  const tbs = windowDays <= 1 ? 'qdr:d' : windowDays <= 7 ? 'qdr:w' : 'qdr:m';

  const results: WebSearchResult[] = [];
  const seen = new Set<string>();

  // Run queries in parallel, limit to 5
  const queryResults = await Promise.allSettled(
    queries.slice(0, 5).map(async (q) => {
      const res = await fetch('https://google.serper.dev/news', {
        method: 'POST',
        headers: {
          'X-API-KEY': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          q,
          tbs,
          autocorrect: false,
          num: 10,
        }),
      });

      if (!res.ok) {
        console.warn(`Serper news search failed for "${q}": ${res.status}`);
        return [];
      }

      const data: SerperResponse = await res.json();
      return (data.news || []).map((item) => ({
        title: item.title,
        url: item.link,
        snippet: item.snippet,
      }));
    })
  );

  for (const result of queryResults) {
    if (result.status === 'fulfilled') {
      for (const item of result.value) {
        if (!seen.has(item.url)) {
          seen.add(item.url);
          results.push(item);
        }
      }
    }
  }

  console.log(`Serper news search found ${results.length} results from ${queries.length} queries`);
  return results;
}

interface ProfileForSearch {
  languages?: string[];
  frameworks?: string[];
  tools?: string[];
  topics?: string[];
}

/**
 * Build targeted search queries from a user profile
 */
export function buildSearchQueries(profile: ProfileForSearch): string[] {
  const queries: string[] = [];
  const techs = [
    ...(profile.languages || []),
    ...(profile.frameworks || []),
    ...(profile.tools || []),
  ];

  // Technology-specific queries (limit to top 3)
  for (const tech of techs.slice(0, 3)) {
    queries.push(`${tech} release announcement`);
  }

  // Add a general "news" query for primary tech
  if (techs.length > 0) {
    queries.push(`${techs[0]} news updates`);
  }

  // Topic-specific queries
  for (const topic of (profile.topics || []).slice(0, 2)) {
    queries.push(`${topic} developer news`);
  }

  return queries;
}

/**
 * Search using Anthropic's web_search tool (fallback)
 */
export async function searchWithAnthropic(
  apiKey: string,
  profile: ProfileForSearch,
  windowDays: number = 7
): Promise<WebSearchResult[]> {
  const technologies = [
    ...(profile.languages || []),
    ...(profile.frameworks || []),
    ...(profile.tools || []),
  ].join(', ');

  const topics = (profile.topics || []).join(', ');

  if (!technologies && !topics) {
    return [];
  }

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
        model: 'claude-sonnet-4-5',
        max_tokens: 2048,
        tools: [{
          type: 'web_search_20250305',
          name: 'web_search',
          max_uses: 5,
        }],
        messages: [{
          role: 'user',
          content: `Search for recent developer news from the past ${windowDays} days relevant to:
- Technologies: ${technologies || 'general programming'}
- Topics: ${topics || 'general tech'}

Find releases, announcements, blog posts, and significant developments. Search for specific technologies and topics.

List each finding as a single line in this exact format:
ITEM: "Title" | URL | Brief description (1 sentence)

Find 5-10 relevant items. Only include items with real URLs you found.`
        }],
      }),
    });

    if (!res.ok) {
      console.warn(`Anthropic web search failed: ${res.status}`);
      return [];
    }

    const result = (await res.json()) as { content?: { type: string; text?: string; citations?: any[] }[] };
    const results: WebSearchResult[] = [];

    for (const block of result.content || []) {
      if (block.type === 'text' && block.text) {
        const lines = block.text.split('\n');
        for (const line of lines) {
          const match = line.match(/^ITEM:\s*"([^"]+)"\s*\|\s*(https?:\/\/[^\s|]+)\s*\|\s*(.+)$/i);
          if (match) {
            results.push({
              title: match[1].trim(),
              url: match[2].trim(),
              snippet: match[3].trim(),
            });
          }
        }
      }

      // Extract from citations if available
      if (block.type === 'text' && block.citations) {
        for (const citation of block.citations) {
          if (citation.type === 'web_search_result_location' && citation.url) {
            if (!results.some(r => r.url === citation.url)) {
              results.push({
                title: citation.title || 'Untitled',
                url: citation.url,
                snippet: citation.cited_text || '',
              });
            }
          }
        }
      }
    }

    console.log(`Anthropic web search found ${results.length} items`);
    return results;
  } catch (e) {
    console.warn('Anthropic web search error:', e);
    return [];
  }
}

interface ApiKeys {
  anthropic?: string;
  serper?: string;
  perplexity?: string;
}

/**
 * Search using Perplexity API (sonar model with built-in web search)
 */
async function searchWithPerplexity(
  apiKey: string,
  profile: ProfileForSearch,
  windowDays: number
): Promise<WebSearchResult[]> {
  const technologies = [
    ...(profile.languages || []),
    ...(profile.frameworks || []),
    ...(profile.tools || []),
  ].join(', ');
  const topics = (profile.topics || []).join(', ');

  if (!technologies && !topics) return [];

  try {
    const res = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [{
          role: 'user',
          content: `Find recent developer news from the past ${windowDays} days about:
- Technologies: ${technologies || 'general programming'}
- Topics: ${topics || 'general tech'}

List 5-10 items. For each, output exactly:
ITEM: "Title" | URL | Brief description`
        }],
        max_tokens: 1024,
      }),
    });

    if (!res.ok) {
      console.warn(`Perplexity search failed: ${res.status}`);
      return [];
    }

    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content || '';
    const results: WebSearchResult[] = [];

    for (const line of content.split('\n')) {
      const match = line.match(/^ITEM:\s*"([^"]+)"\s*\|\s*(https?:\/\/[^\s|]+)\s*\|\s*(.+)$/i);
      if (match) {
        results.push({
          title: match[1].trim(),
          url: match[2].trim(),
          snippet: match[3].trim(),
        });
      }
    }

    console.log(`Perplexity search found ${results.length} items`);
    return results;
  } catch (e) {
    console.warn('Perplexity search error:', e);
    return [];
  }
}

/**
 * Unified search function
 * Priority: Serper (cheapest) > Perplexity > Anthropic (most expensive)
 */
export async function searchWeb(
  keys: ApiKeys,
  profile: ProfileForSearch,
  windowDays: number = 7
): Promise<WebSearchResult[]> {
  // Prefer Serper (cheapest, $1/1k)
  if (keys.serper) {
    const queries = buildSearchQueries(profile);
    if (queries.length > 0) {
      return searchWithSerper(keys.serper, queries, windowDays);
    }
  }

  // Try Perplexity (mid-tier, has built-in synthesis)
  if (keys.perplexity) {
    return searchWithPerplexity(keys.perplexity, profile, windowDays);
  }

  // Fall back to Anthropic's web search tool (most expensive)
  if (keys.anthropic) {
    return searchWithAnthropic(keys.anthropic, profile, windowDays);
  }

  return [];
}
