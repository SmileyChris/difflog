interface Profile {
  languages: string[];
  frameworks: string[];
  tools: string[];
  topics: string[];
  depth: 'quick' | 'standard' | 'deep';
}

export interface ResolvedSources {
  subreddits: string[];
  lobsters_tags: string[];
  devto_tags: string[];
}

interface FeedItem {
  title: string;
  url: string;
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
      const item = await r.json();
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
      const stories: any[] = await res.json();
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
      const res = await fetchWithTimeout(`https://www.reddit.com/r/${sub}/hot.json?limit=${perSub + 2}`, {
        headers: { 'User-Agent': 'Difflog/1.0' },
      });
      const data = await res.json();
      const posts = (data?.data?.children || []).slice(0, perSub);
      return posts.map((post: any) => ({
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
        { headers: { 'Accept': 'application/vnd.github.v3+json' } }
      );
      const data = await res.json();
      const repos = data?.items || [];
      return repos.map((repo: any) => ({
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
      const articles = await res.json();
      if (!Array.isArray(articles)) return [];
      return articles.map((article: any) => ({
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

export function getUnmatchedItems(profile: Profile): string[] {
  const allMapped = new Set([
    ...Object.keys(LANGUAGE_SUBREDDITS),
    ...Object.keys(FRAMEWORK_SUBREDDITS),
    ...Object.keys(TOOL_SUBREDDITS),
    ...Object.keys(TOPIC_SUBREDDITS),
  ]);
  const allItems = [...profile.languages, ...profile.frameworks, ...(profile.tools || []), ...profile.topics];
  return allItems.filter(item => !allMapped.has(item));
}

export async function fetchFeeds(profile: Profile, lastDiffDate?: string, resolvedSources?: ResolvedSources): Promise<FeedResults> {
  const days = getDaysSince(lastDiffDate);
  const [hn, lobsters, reddit, github, devto] = await Promise.allSettled([
    fetchHackerNews(),
    fetchLobsters(resolvedSources?.lobsters_tags),
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

function formatItems(items: FeedItem[]): string {
  return items
    .map(item => {
      const scoreStr = item.score != null ? ` (${item.score} pts)` : '';
      return `- [${item.source}] "${item.title}"${scoreStr} ${item.url}`;
    })
    .join('\n');
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

export function formatFeedsForPrompt(feeds: FeedResults, depth: string): string {
  const items = getAllFeedItems(feeds);
  if (items.length === 0) return '';
  return `## REAL-TIME FEED DATA (Use these as sources — link to actual URLs)\n\n${formatItems(items)}`;
}
