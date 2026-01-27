/**
 * Fetches feeds from various sources server-side to bypass CORS
 * Returns combined feed items for client to use in prompts
 */

interface Env {
  DB: D1Database;
}

interface FeedItem {
  title: string;
  url: string;
  score?: number;
  source: string;
  date?: number;
}

interface Profile {
  languages: string[];
  frameworks: string[];
  tools: string[];
  topics: string[];
}

const FETCH_TIMEOUT = 5000;

const LANGUAGE_SUBREDDITS: Record<string, string[]> = {
  JavaScript: ['javascript', 'node'],
  TypeScript: ['typescript'],
  Python: ['python'],
  Rust: ['rust'],
  Go: ['golang'],
  Java: ['java'],
  'C#': ['csharp', 'dotnet'],
  Ruby: ['ruby'],
  PHP: ['PHP'],
  Swift: ['swift'],
  Kotlin: ['Kotlin'],
  C: ['C_Programming'],
  'C++': ['cpp'],
};

const FRAMEWORK_SUBREDDITS: Record<string, string[]> = {
  React: ['reactjs'],
  Vue: ['vuejs'],
  Angular: ['Angular2'],
  Svelte: ['sveltejs'],
  'Next.js': ['nextjs'],
  Nuxt: ['Nuxt'],
  Express: ['expressjs'],
  Django: ['django'],
  Flask: ['flask'],
  Rails: ['rails'],
  Spring: ['SpringBoot'],
  Laravel: ['laravel'],
  'Node.js': ['node'],
  Deno: ['Deno'],
  Bun: ['bunjs'],
};

const TOOL_SUBREDDITS: Record<string, string[]> = {
  Docker: ['docker'],
  Kubernetes: ['kubernetes'],
  Terraform: ['Terraform'],
  AWS: ['aws'],
  GCP: ['googlecloud'],
  Azure: ['AZURE'],
  Vercel: ['nextjs'],
  Cloudflare: ['CloudFlare'],
};

const TOPIC_SUBREDDITS: Record<string, string[]> = {
  'AI/ML & LLMs': ['MachineLearning', 'LocalLLaMA'],
  'DevOps & Platform': ['devops'],
  'Security & Privacy': ['netsec'],
  'Open Source': ['opensource'],
  'System Design': ['softwarearchitecture'],
};

const TOPIC_DEVTO_TAGS: Record<string, string[]> = {
  'AI/ML & LLMs': ['ai', 'machinelearning', 'llm'],
  'DevOps & Platform': ['devops', 'docker'],
  'Security & Privacy': ['security'],
  'Web Performance': ['webdev', 'performance'],
  'Open Source': ['opensource'],
};

function getSubreddits(profile: Profile): string[] {
  const subs = new Set<string>();
  for (const lang of profile.languages || []) {
    LANGUAGE_SUBREDDITS[lang]?.forEach(s => subs.add(s));
  }
  for (const fw of profile.frameworks || []) {
    FRAMEWORK_SUBREDDITS[fw]?.forEach(s => subs.add(s));
  }
  for (const tool of profile.tools || []) {
    TOOL_SUBREDDITS[tool]?.forEach(s => subs.add(s));
  }
  for (const topic of profile.topics || []) {
    TOPIC_SUBREDDITS[topic]?.forEach(s => subs.add(s));
  }
  if (subs.size === 0) subs.add('programming');
  return [...subs].slice(0, 8); // Limit to avoid too many requests
}

function getDevToTags(profile: Profile): string[] {
  const tags = new Set<string>();
  for (const topic of profile.topics || []) {
    TOPIC_DEVTO_TAGS[topic]?.forEach(t => tags.add(t));
  }
  for (const lang of profile.languages || []) {
    tags.add(lang.toLowerCase());
  }
  if (tags.size === 0) tags.add('programming');
  return [...tags].slice(0, 5);
}

async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchHackerNews(): Promise<FeedItem[]> {
  try {
    const res = await fetchWithTimeout('https://hacker-news.firebaseio.com/v0/topstories.json');
    const ids: number[] = await res.json();
    const top30 = ids.slice(0, 30);

    const items = await Promise.allSettled(
      top30.map(async (id) => {
        const r = await fetchWithTimeout(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
        const item = await r.json();
        return {
          title: item.title || '',
          url: item.url || `https://news.ycombinator.com/item?id=${id}`,
          score: item.score,
          source: 'HN',
          date: item.time ? item.time * 1000 : undefined,
        } as FeedItem;
      })
    );

    return items
      .filter((r): r is PromiseFulfilledResult<FeedItem> => r.status === 'fulfilled')
      .map(r => r.value)
      .filter(item => item.title);
  } catch {
    return [];
  }
}

async function fetchLobsters(): Promise<FeedItem[]> {
  try {
    const res = await fetchWithTimeout('https://lobste.rs/hottest.json');
    const stories: any[] = await res.json();
    return stories.slice(0, 25).map(story => ({
      title: story.title || '',
      url: story.url || `https://lobste.rs/s/${story.short_id}`,
      score: story.score,
      source: 'Lobsters',
      date: story.created_at ? new Date(story.created_at).getTime() : undefined,
    }));
  } catch {
    return [];
  }
}

async function fetchReddit(subreddits: string[]): Promise<FeedItem[]> {
  const allItems: FeedItem[] = [];
  const perSub = Math.max(3, Math.floor(20 / subreddits.length));

  const results = await Promise.allSettled(
    subreddits.map(async (sub) => {
      const res = await fetchWithTimeout(
        `https://www.reddit.com/r/${sub}/hot.json?limit=${perSub}`,
        { headers: { 'User-Agent': 'Difflog/1.0' } }
      );
      const data = await res.json();
      return (data?.data?.children || []).map((post: any) => ({
        title: post.data.title || '',
        url: post.data.url?.startsWith('http') ? post.data.url : `https://reddit.com${post.data.permalink}`,
        score: post.data.score,
        source: `r/${sub}`,
        date: post.data.created_utc ? post.data.created_utc * 1000 : undefined,
      } as FeedItem));
    })
  );

  for (const result of results) {
    if (result.status === 'fulfilled') {
      allItems.push(...result.value);
    }
  }

  return allItems.filter(item => item.title);
}

async function fetchGitHub(languages: string[]): Promise<FeedItem[]> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const langs = languages.length > 0 ? languages.slice(0, 3) : [''];
  const perLang = Math.max(3, Math.floor(10 / langs.length));
  const allItems: FeedItem[] = [];

  const results = await Promise.allSettled(
    langs.map(async (lang) => {
      const langQuery = lang ? ` language:${lang.toLowerCase()}` : '';
      const res = await fetchWithTimeout(
        `https://api.github.com/search/repositories?q=created:>${since}${encodeURIComponent(langQuery)}&sort=stars&order=desc&per_page=${perLang}`,
        { headers: { 'Accept': 'application/vnd.github.v3+json' } }
      );
      const data = await res.json();
      return (data?.items || []).map((repo: any) => ({
        title: `${repo.full_name}: ${repo.description || 'No description'}`,
        url: repo.html_url,
        score: repo.stargazers_count,
        source: `GitHub${lang ? ` (${lang})` : ''}`,
      } as FeedItem));
    })
  );

  for (const result of results) {
    if (result.status === 'fulfilled') {
      allItems.push(...result.value);
    }
  }

  return allItems;
}

async function fetchDevTo(tags: string[]): Promise<FeedItem[]> {
  const perTag = Math.max(2, Math.floor(10 / tags.length));
  const allItems: FeedItem[] = [];

  const results = await Promise.allSettled(
    tags.map(async (tag) => {
      const res = await fetchWithTimeout(`https://dev.to/api/articles?tag=${tag}&top=7&per_page=${perTag}`);
      const articles = await res.json();
      if (!Array.isArray(articles)) return [];
      return articles.map((article: any) => ({
        title: article.title || '',
        url: article.url,
        score: article.positive_reactions_count,
        source: `Dev.to`,
      } as FeedItem));
    })
  );

  for (const result of results) {
    if (result.status === 'fulfilled') {
      allItems.push(...result.value);
    }
  }

  return allItems.filter(item => item.title);
}

function formatFeedsForPrompt(items: FeedItem[]): string {
  if (items.length === 0) return '';

  const formatted = items
    .map(item => {
      const scoreStr = item.score != null ? ` (${item.score} pts)` : '';
      return `- [${item.source}] "${item.title}"${scoreStr} ${item.url}`;
    })
    .join('\n');

  return `## REAL-TIME FEED DATA (Use these as sources — link to actual URLs)\n\n${formatted}`;
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    const body = await ctx.request.json() as Profile;

    const subreddits = getSubreddits(body);
    const devtoTags = getDevToTags(body);

    // Fetch all feeds in parallel
    const [hn, lobsters, reddit, github, devto] = await Promise.allSettled([
      fetchHackerNews(),
      fetchLobsters(),
      fetchReddit(subreddits),
      fetchGitHub(body.languages || []),
      fetchDevTo(devtoTags),
    ]);

    const allItems: FeedItem[] = [
      ...(hn.status === 'fulfilled' ? hn.value : []),
      ...(lobsters.status === 'fulfilled' ? lobsters.value : []),
      ...(reddit.status === 'fulfilled' ? reddit.value : []),
      ...(github.status === 'fulfilled' ? github.value : []),
      ...(devto.status === 'fulfilled' ? devto.value : []),
    ];

    // Filter to last 7 days
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recentItems = allItems.filter(item => !item.date || item.date >= cutoff);

    const feedContext = formatFeedsForPrompt(recentItems);

    return new Response(JSON.stringify({
      items: recentItems.length,
      context: feedContext,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      items: 0,
      context: '',
      error: 'Failed to fetch feeds',
    }), {
      status: 200, // Return 200 with empty context so client can proceed
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
};

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
};
