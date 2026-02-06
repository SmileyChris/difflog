import type { ResolvedMapping, ApiKeys } from './sync';
import { completeJson } from './llm';
import { searchWeb, type WebSearchResult } from './search';
// Re-export search types for backwards compatibility
export { searchWeb, type WebSearchResult } from './search';

interface Profile {
  languages: string[];
  frameworks: string[];
  tools: string[];
  topics: string[];
  depth: GenerationDepth;
  resolvedMappings?: Record<string, ResolvedMapping>;
}

export interface ResolvedSources {
  subreddits: string[];
  lobsters_tags: string[];
  devto_tags: string[];
}

export interface FeedItem {
  title: string;
  url: string;
  discussionUrl?: string; // HN comments, Reddit thread, etc.
  score?: number;
  source: string;
  date?: number; // epoch ms
}

interface FeedResults {
  hn: FeedItem[];
  lobsters: FeedItem[];
  reddit: FeedItem[];
  github: FeedItem[];
  devto: FeedItem[];
}

// External API response types (partial, only fields we use)
interface LobstersStory {
  title?: string;
  url?: string;
  comments_url?: string;
  short_id?: string;
  score?: number;
  created_at?: string;
}

interface RedditPost {
  data: {
    title?: string;
    url?: string;
    permalink?: string;
    score?: number;
    created_utc?: number;
  };
}

interface GitHubRepo {
  full_name?: string;
  description?: string;
  html_url?: string;
  stargazers_count?: number;
}

interface DevToArticle {
  title?: string;
  url?: string;
  positive_reactions_count?: number;
}

const FETCH_TIMEOUT = 5000;

const LANGUAGE_SUBREDDITS: Record<string, string[]> = {
  JavaScript: ['javascript', 'node'],
  TypeScript: ['typescript'],
  Python: ['python', 'learnpython'],
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
  Next: ['nextjs'],
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
  'GitHub Actions': ['github'],
  'GitLab CI': ['gitlab'],
  Jenkins: ['jenkinsci'],
  Ansible: ['ansible'],
  Prometheus: ['PrometheusMonitoring'],
  Grafana: ['grafana'],
  Redis: ['redis'],
  PostgreSQL: ['PostgreSQL'],
  MongoDB: ['mongodb'],
  SQLite: ['sqlite'],
};

const TOPIC_SUBREDDITS: Record<string, string[]> = {
  'AI/ML & LLMs': ['MachineLearning', 'LocalLLaMA', 'artificial'],
  'DevOps & Platform': ['devops', 'platformengineering'],
  'Security & Privacy': ['netsec', 'cybersecurity'],
  'Web Performance': ['webdev', 'Frontend'],
  'Open Source': ['opensource'],
  'Startups & Funding': ['startups', 'SideProject'],
  'Career & Jobs': ['cscareerquestions', 'ExperiencedDevs'],
  'System Design': ['softwarearchitecture', 'systemdesign'],
  'Mobile Dev': ['mobiledev', 'iOSProgramming', 'androiddev'],
  'Game Dev': ['gamedev', 'indiegaming'],
  'Data Engineering': ['dataengineering'],
  'Blockchain/Web3': ['CryptoTechnology', 'ethereum'],
  'Edge Computing': ['edge', 'IoT'],
  'Developer Tools': ['devtools', 'commandline'],
};

const TOPIC_DEVTO_TAGS: Record<string, string[]> = {
  'AI/ML & LLMs': ['ai', 'machinelearning', 'llm'],
  'DevOps & Platform': ['devops', 'docker', 'kubernetes'],
  'Security & Privacy': ['security', 'cybersecurity'],
  'Web Performance': ['webdev', 'javascript', 'performance'],
  'Open Source': ['opensource'],
  'Startups & Funding': ['startup', 'entrepreneurship'],
  'Career & Jobs': ['career', 'beginners'],
  'System Design': ['architecture', 'systemdesign'],
  'Mobile Dev': ['mobile', 'reactnative', 'flutter'],
  'Game Dev': ['gamedev'],
  'Data Engineering': ['data', 'database'],
  'Blockchain/Web3': ['blockchain', 'web3'],
  'Edge Computing': ['edge', 'iot'],
  'Developer Tools': ['devtools', 'productivity'],
};

function getSubreddits(profile: Profile): string[] {
  const subs = new Set<string>();

  for (const lang of profile.languages) {
    const mapped = LANGUAGE_SUBREDDITS[lang];
    if (mapped) mapped.forEach(s => subs.add(s));
  }
  for (const fw of profile.frameworks) {
    const mapped = FRAMEWORK_SUBREDDITS[fw];
    if (mapped) mapped.forEach(s => subs.add(s));
  }
  for (const tool of (profile.tools || [])) {
    const mapped = TOOL_SUBREDDITS[tool];
    if (mapped) mapped.forEach(s => subs.add(s));
  }
  for (const topic of profile.topics) {
    const mapped = TOPIC_SUBREDDITS[topic];
    if (mapped) mapped.forEach(s => subs.add(s));
  }

  // Add resolved custom mappings
  for (const mapping of Object.values(profile.resolvedMappings || {})) {
    mapping.subreddits?.forEach(s => subs.add(s));
  }

  if (subs.size === 0) subs.add('programming');
  return [...subs];
}

function getDevToTags(profile: Profile): string[] {
  const tags = new Set<string>();

  for (const topic of profile.topics) {
    const mapped = TOPIC_DEVTO_TAGS[topic];
    if (mapped) mapped.forEach(t => tags.add(t));
  }
  for (const lang of profile.languages) {
    tags.add(lang.toLowerCase());
  }

  // Add resolved custom mappings
  for (const mapping of Object.values(profile.resolvedMappings || {})) {
    mapping.devtoTags?.forEach(t => tags.add(t));
  }

  if (tags.size === 0) tags.add('programming');
  return [...tags];
}

async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchHackerNews(): Promise<FeedItem[]> {
  const res = await fetchWithTimeout('https://hacker-news.firebaseio.com/v0/topstories.json');
  const ids: number[] = await res.json();
  const top50 = ids.slice(0, 50);

  const items = await Promise.allSettled(
    top50.map(async (id) => {
      const r = await fetchWithTimeout(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
      const item = (await r.json()) as { title?: string; url?: string; score?: number; time?: number };
      return {
        title: item.title || '',
        url: item.url || `https://news.ycombinator.com/item?id=${id}`,
        score: item.score,
        source: 'Hacker News',
        date: item.time ? item.time * 1000 : undefined,
      } as FeedItem;
    })
  );

  return items
    .filter((r): r is PromiseFulfilledResult<FeedItem> => r.status === 'fulfilled')
    .map(r => r.value)
    .filter(item => item.title);
}

async function fetchLobsters(extraTags?: string[]): Promise<FeedItem[]> {
  const urls = ['https://lobste.rs/hottest.json'];
  if (extraTags && extraTags.length > 0) {
    for (const tag of extraTags) {
      urls.push(`https://lobste.rs/t/${encodeURIComponent(tag)}.json`);
    }
  }

  const results = await Promise.allSettled(
    urls.map(async (url) => {
      const res = await fetchWithTimeout(url);
      const stories = (await res.json()) as LobstersStory[];
      return stories.slice(0, 40).map(story => ({
        title: story.title || '',
        url: story.url || story.comments_url || `https://lobste.rs/s/${story.short_id}`,
        score: story.score,
        source: 'Lobsters',
        date: story.created_at ? new Date(story.created_at).getTime() : undefined,
      }));
    })
  );

  const seen = new Set<string>();
  const items: FeedItem[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      for (const item of result.value) {
        if (item.title && !seen.has(item.url)) {
          seen.add(item.url);
          items.push(item);
        }
      }
    }
  }
  return items;
}

async function fetchReddit(profile: Profile, extraSubs?: string[]): Promise<FeedItem[]> {
  const subreddits = [...getSubreddits(profile), ...(extraSubs || [])];
  const allItems: FeedItem[] = [];
  const perSub = Math.max(5, Math.floor(25 / subreddits.length));

  const results = await Promise.allSettled(
    subreddits.map(async (sub) => {
      const res = await fetchWithTimeout(`https://www.reddit.com/r/${sub}/hot.json?limit=${perSub}`, {
        headers: { 'User-Agent': 'Difflog/1.0' },
      });
      const data = (await res.json()) as { data?: { children?: RedditPost[] } };
      const posts: RedditPost[] = (data?.data?.children || []).slice(0, perSub);
      return posts.map((post) => ({
        title: post.data.title || '',
        url: post.data.url || `https://reddit.com${post.data.permalink}`,
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

async function fetchGitHubTrending(profile: Profile, days: number = 7): Promise<FeedItem[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const languages = profile.languages.length > 0 ? profile.languages.slice(0, 5) : [''];
  const perLang = Math.max(4, Math.floor(15 / languages.length));
  const allItems: FeedItem[] = [];

  const results = await Promise.allSettled(
    languages.map(async (lang) => {
      const langQuery = lang ? ` language:${lang.toLowerCase()}` : '';
      const res = await fetchWithTimeout(
        `https://api.github.com/search/repositories?q=created:>${since}${encodeURIComponent(langQuery)}&sort=stars&order=desc&per_page=${perLang}`,
        { headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'Difflog/1.0' } }
      );
      const data = (await res.json()) as { items?: GitHubRepo[] };
      const repos: GitHubRepo[] = data?.items || [];
      return repos.map((repo) => ({
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

async function fetchDevTo(profile: Profile, days: number = 7, extraTags?: string[]): Promise<FeedItem[]> {
  const tags = [...new Set([...getDevToTags(profile), ...(extraTags || [])])];
  const perTag = Math.max(3, Math.floor(12 / tags.length));
  const allItems: FeedItem[] = [];

  const results = await Promise.allSettled(
    tags.map(async (tag) => {
      const res = await fetchWithTimeout(
        `https://dev.to/api/articles?tag=${tag}&top=${days}&per_page=${perTag}`
      );
      const articles: DevToArticle[] = await res.json();
      if (!Array.isArray(articles)) return [];
      return articles.map((article) => ({
        title: article.title || '',
        url: article.url,
        score: article.positive_reactions_count,
        source: `Dev.to (${tag})`,
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

function getDaysSince(dateStr?: string): number {
  if (!dateStr) return 7;
  const diff = Math.ceil((Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
  return Math.min(Math.max(diff, 1), 7);
}

function filterByDate(items: FeedItem[], days: number): FeedItem[] {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return items.filter(item => !item.date || item.date >= cutoff);
}

function getLobstersTags(profile: Profile): string[] {
  const tags = new Set<string>();

  // Add resolved custom mappings
  for (const mapping of Object.values(profile.resolvedMappings || {})) {
    mapping.lobstersTags?.forEach(t => tags.add(t));
  }

  return [...tags];
}

export interface UnmappedItem {
  item: string;
  category: 'language' | 'framework' | 'tool' | 'topic';
}

export function getUnmappedItems(profile: Profile): UnmappedItem[] {
  const unmapped: UnmappedItem[] = [];

  for (const lang of profile.languages || []) {
    if (!LANGUAGE_SUBREDDITS[lang] && !profile.resolvedMappings?.[lang]) {
      unmapped.push({ item: lang, category: 'language' });
    }
  }
  for (const fw of profile.frameworks || []) {
    if (!FRAMEWORK_SUBREDDITS[fw] && !profile.resolvedMappings?.[fw]) {
      unmapped.push({ item: fw, category: 'framework' });
    }
  }
  for (const tool of profile.tools || []) {
    if (!TOOL_SUBREDDITS[tool] && !profile.resolvedMappings?.[tool]) {
      unmapped.push({ item: tool, category: 'tool' });
    }
  }
  for (const topic of profile.topics || []) {
    if (!TOPIC_SUBREDDITS[topic] && !profile.resolvedMappings?.[topic]) {
      unmapped.push({ item: topic, category: 'topic' });
    }
  }

  return unmapped;
}

export async function resolveSourcesForItem(
  keys: ApiKeys,
  item: string,
  category: 'language' | 'framework' | 'tool' | 'topic'
): Promise<ResolvedMapping> {
  const emptyMapping: ResolvedMapping = { subreddits: [], lobstersTags: [], devtoTags: [] };

  const prompt = `You're helping configure a developer news feed. Given the ${category} "${item}", suggest relevant sources. Be specific and practical.

Return:
- subreddits: Reddit communities (without r/ prefix)
- lobstersTags: Lobste.rs tags
- devtoTags: Dev.to tags

Only include sources that actually exist and are active. Prefer popular, well-established communities over niche ones.`;

  const schema = {
    type: 'object' as const,
    properties: {
      subreddits: {
        type: 'array',
        items: { type: 'string' },
        description: 'Reddit subreddit names without the r/ prefix'
      },
      lobstersTags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Lobste.rs tag names'
      },
      devtoTags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Dev.to tag names'
      }
    },
    required: ['subreddits', 'lobstersTags', 'devtoTags']
  };

  const result = await completeJson<ResolvedMapping>(keys, prompt, schema);

  if (!result) {
    console.warn(`AI source resolution failed for "${item}"`);
    return emptyMapping;
  }

  return {
    subreddits: result.subreddits || [],
    lobstersTags: result.lobstersTags || [],
    devtoTags: result.devtoTags || [],
  };
}

// WebSearchResult is now exported from ./search

/**
 * Filter general feed items (HN, Lobsters) for relevance to user's profile.
 * Uses cheapest available LLM to quickly determine which items are worth including.
 */
export async function curateGeneralFeeds(
  keys: ApiKeys,
  items: FeedItem[],
  profile: Profile
): Promise<FeedItem[]> {
  if (items.length === 0) return [];

  // Build profile context
  const tracking = [
    ...(profile.languages || []),
    ...(profile.frameworks || []),
    ...(profile.tools || []),
  ].join(', ') || 'general programming';
  const interests = (profile.topics || []).join(', ') || 'general tech';

  // Format items with indices for reference
  const itemList = items.map((item, i) =>
    `[${i}] "${item.title}" (${item.source})`
  ).join('\n');

  const prompt = `You're filtering a developer news feed. Select items relevant to this developer's profile.

PROFILE:
- Technologies: ${tracking}
- Interests: ${interests}

RULES:
- Include items directly related to their technologies or interests
- Include major tech news, security alerts, or industry shifts they should know about
- Include interesting technical content even if tangentially related
- Exclude generic business news, politics, or off-topic content
- When in doubt, include it — better to have slightly more than miss something important

ITEMS:
${itemList}

Return the indices of relevant items.`;

  const schema = {
    type: 'object' as const,
    properties: {
      indices: {
        type: 'array',
        items: { type: 'number' },
        description: 'Array of item indices (0-based) that are relevant'
      }
    },
    required: ['indices']
  };

  const result = await completeJson<{ indices: number[] }>(keys, prompt, schema);

  if (!result?.indices) {
    console.warn('Feed curation returned no indices, returning all items');
    return items;
  }

  const filtered = result.indices
    .filter(i => i >= 0 && i < items.length)
    .map(i => items[i]);

  console.log(`Curated ${items.length} items → ${filtered.length} relevant`);
  return filtered;
}

export async function fetchFeeds(profile: Profile, lastDiffDate?: string, resolvedSources?: ResolvedSources): Promise<FeedResults> {
  const days = getDaysSince(lastDiffDate);
  // Get extra tags from resolved mappings in profile
  const lobstersTags = getLobstersTags(profile);
  const [hn, lobsters, reddit, github, devto] = await Promise.allSettled([
    fetchHackerNews(),
    fetchLobsters([...lobstersTags, ...(resolvedSources?.lobsters_tags || [])]),
    fetchReddit(profile, resolvedSources?.subreddits),
    fetchGitHubTrending(profile, days),
    fetchDevTo(profile, days, resolvedSources?.devto_tags),
  ]);

  return {
    hn: filterByDate(hn.status === 'fulfilled' ? hn.value : [], days),
    lobsters: filterByDate(lobsters.status === 'fulfilled' ? lobsters.value : [], days),
    reddit: filterByDate(reddit.status === 'fulfilled' ? reddit.value : [], days),
    github: github.status === 'fulfilled' ? github.value : [],
    devto: devto.status === 'fulfilled' ? devto.value : [],
  };
}

export function formatItems(items: FeedItem[]): string {
  return items
    .map(item => {
      // GitHub items: (500 stars on JavaScript GH)
      if (item.source.startsWith('GitHub')) {
        const lang = item.source.match(/\((\w+)\)/)?.[1] || '';
        const langStr = lang ? `${lang} ` : '';
        const scoreStr = item.score != null ? ` (${item.score} stars on ${langStr}GitHub)` : '';
        return `- "${item.title}"${scoreStr} ${item.url}`;
      }

      // Other items: (100 [HN](discussion-url) pts)
      // Only link the source when discussion URL differs from article URL
      const hasDiscussion = item.discussionUrl && item.discussionUrl !== item.url;
      const sourceStr = hasDiscussion
        ? `[${item.source}](${item.discussionUrl})`
        : item.source;
      const scoreStr = item.score != null ? ` (${item.score} ${sourceStr} pts)` : ` (${sourceStr})`;
      return `- "${item.title}"${scoreStr} ${item.url}`;
    })
    .join('\n');
}

export function formatItemsForPrompt(items: FeedItem[]): string {
  if (items.length === 0) return '';

  // Separate GitHub items to add context about what they are
  const githubItems = items.filter(i => i.source.startsWith('GitHub'));
  const otherItems = items.filter(i => !i.source.startsWith('GitHub'));

  let result = '## REAL-TIME FEED DATA (Use these as sources — link to actual URLs)\n\n';

  if (otherItems.length > 0) {
    result += formatItems(otherItems) + '\n';
  }

  if (githubItems.length > 0) {
    result += '\n### New GitHub repos (created this week, sorted by stars)\n';
    result += formatItems(githubItems);
  }

  return result;
}

export function formatWebSearchForPrompt(results: WebSearchResult[]): string {
  if (results.length === 0) return '';
  const formatted = results
    .map(r => `- "${r.title}" ${r.url}\n  ${r.snippet}`)
    .join('\n');
  return `## WEB SEARCH RESULTS (Additional sources from the web)\n\n${formatted}`;
}

export function getAllFeedItems(feeds: FeedResults): FeedItem[] {
  return [...feeds.hn, ...feeds.lobsters, ...feeds.reddit, ...feeds.github, ...feeds.devto];
}

export function buildCurationPrompt(items: FeedItem[], profile: Profile): string {
  const allFormatted = formatItems(items);
  return `You are a strict developer news curator. Filter the feed items below to ONLY those relevant to this developer's profile. Be aggressive about excluding irrelevant content.

DEVELOPER PROFILE:
- Tracking (languages/frameworks/tools): ${[...profile.languages, ...profile.frameworks, ...(profile.tools || [])].join(', ') || 'General'}
- Focus (topics & interests): ${profile.topics.join(', ') || 'General tech'}

RULES:
- EXCLUDE stories unrelated to what the developer is tracking or focused on
- EXCLUDE generic business news, politics, or non-tech content unless it directly impacts the developer's stack
- INCLUDE security alerts and breaking changes even if tangentially related
- INCLUDE major industry shifts that affect the developer's ecosystem
- Aim for 10-20 highly relevant items (fewer is better than including noise)
- Keep diversity across sources (don't let one source dominate)

ALL FEED ITEMS (${items.length} total):
${allFormatted}

Return ONLY the selected items, one per line, in the exact same format as above (keep the [Source], title, score, and URL intact). No commentary, no numbering.`;
}

export function formatCuratedForPrompt(curatedText: string): string {
  if (!curatedText.trim()) return '';
  return `## CURATED FEED DATA (Use these as sources — link to actual URLs)\n\n${curatedText}`;
}

export function formatFeedsForPrompt(feeds: FeedResults, depth: GenerationDepth): string {
  const items = getAllFeedItems(feeds);
  if (items.length === 0) return '';
  return `## REAL-TIME FEED DATA (Use these as sources — link to actual URLs)\n\n${formatItems(items)}`;
}
