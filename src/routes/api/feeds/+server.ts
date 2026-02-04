/**
 * POST /api/feeds
 * Fetches feeds from various sources server-side to bypass CORS
 * Returns combined feed items for client to use in prompts
 */

import type { RequestHandler } from './$types';

interface FeedItem {
	title: string;
	url: string;
	discussionUrl?: string;
	score?: number;
	source: string;
	date?: number;
}

interface ResolvedMapping {
	subreddits: string[];
	lobstersTags: string[];
	devtoTags: string[];
}

interface Profile {
	languages: string[];
	frameworks: string[];
	tools: string[];
	topics: string[];
	resolvedMappings?: Record<string, ResolvedMapping>;
}

const FETCH_TIMEOUT = 8000;

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
	'C++': ['cpp']
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
	Bun: ['bunjs']
};

const TOOL_SUBREDDITS: Record<string, string[]> = {
	Docker: ['docker'],
	Kubernetes: ['kubernetes'],
	Terraform: ['Terraform'],
	AWS: ['aws'],
	GCP: ['googlecloud'],
	Azure: ['AZURE'],
	Vercel: ['nextjs'],
	Cloudflare: ['CloudFlare']
};

const TOPIC_SUBREDDITS: Record<string, string[]> = {
	'AI/ML & LLMs': ['MachineLearning', 'LocalLLaMA'],
	'DevOps & Platform': ['devops'],
	'Security & Privacy': ['netsec'],
	'Open Source': ['opensource'],
	'System Design': ['softwarearchitecture']
};

const TOPIC_DEVTO_TAGS: Record<string, string[]> = {
	'AI/ML & LLMs': ['ai', 'machinelearning', 'llm'],
	'DevOps & Platform': ['devops', 'docker'],
	'Security & Privacy': ['security'],
	'Web Performance': ['webdev', 'performance'],
	'Open Source': ['opensource']
};

function getSubreddits(profile: Profile): string[] {
	const subs = new Set<string>();
	for (const lang of profile.languages || []) {
		LANGUAGE_SUBREDDITS[lang]?.forEach((s) => subs.add(s));
	}
	for (const fw of profile.frameworks || []) {
		FRAMEWORK_SUBREDDITS[fw]?.forEach((s) => subs.add(s));
	}
	for (const tool of profile.tools || []) {
		TOOL_SUBREDDITS[tool]?.forEach((s) => subs.add(s));
	}
	for (const topic of profile.topics || []) {
		TOPIC_SUBREDDITS[topic]?.forEach((s) => subs.add(s));
	}
	// Add resolved custom mappings
	for (const mapping of Object.values(profile.resolvedMappings || {})) {
		mapping.subreddits?.forEach((s) => subs.add(s));
	}
	if (subs.size === 0) subs.add('programming');
	return [...subs].slice(0, 12); // Limit to avoid too many requests
}

function getDevToTags(profile: Profile): string[] {
	const tags = new Set<string>();
	for (const topic of profile.topics || []) {
		TOPIC_DEVTO_TAGS[topic]?.forEach((t) => tags.add(t));
	}
	for (const lang of profile.languages || []) {
		tags.add(lang.toLowerCase());
	}
	// Add resolved custom mappings
	for (const mapping of Object.values(profile.resolvedMappings || {})) {
		mapping.devtoTags?.forEach((t) => tags.add(t));
	}
	if (tags.size === 0) tags.add('programming');
	return [...tags].slice(0, 8);
}

function getLobstersTags(profile: Profile): string[] {
	const tags = new Set<string>();
	// Add resolved custom mappings
	for (const mapping of Object.values(profile.resolvedMappings || {})) {
		mapping.lobstersTags?.forEach((t) => tags.add(t));
	}
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
				const r = await fetchWithTimeout(
					`https://hacker-news.firebaseio.com/v0/item/${id}.json`
				);
				const item = await r.json();
				const discussionUrl = `https://news.ycombinator.com/item?id=${id}`;
				return {
					title: item.title || '',
					url: item.url || discussionUrl,
					discussionUrl: item.url ? discussionUrl : undefined, // Only if article URL exists
					score: item.score,
					source: 'HN',
					date: item.time ? item.time * 1000 : undefined
				} as FeedItem;
			})
		);

		return items
			.filter((r): r is PromiseFulfilledResult<FeedItem> => r.status === 'fulfilled')
			.map((r) => r.value)
			.filter((item) => item.title);
	} catch {
		return [];
	}
}

async function fetchLobsters(tags: string[] = []): Promise<FeedItem[]> {
	try {
		const urls = ['https://lobste.rs/hottest.json'];
		for (const tag of tags) {
			urls.push(`https://lobste.rs/t/${encodeURIComponent(tag)}.json`);
		}

		const results = await Promise.allSettled(
			urls.map(async (url) => {
				const res = await fetchWithTimeout(url);
				const stories: any[] = await res.json();
				return stories.slice(0, 20).map((story) => {
					const discussionUrl =
						story.comments_url || `https://lobste.rs/s/${story.short_id}`;
					return {
						title: story.title || '',
						url: story.url || discussionUrl,
						discussionUrl: story.url ? discussionUrl : undefined,
						score: story.score,
						source: 'Lobsters',
						date: story.created_at ? new Date(story.created_at).getTime() : undefined
					};
				});
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
			return (data?.data?.children || []).map((post: any) => {
				const discussionUrl = `https://reddit.com${post.data.permalink}`;
				const articleUrl = post.data.url?.startsWith('http') ? post.data.url : null;
				// Check if articleUrl is truly external (not reddit self-post, image, video, or gallery)
				const isRedditMedia =
					articleUrl &&
					(articleUrl.includes('reddit.com/r/') ||
						articleUrl.includes('reddit.com/gallery') ||
						articleUrl.includes('i.redd.it') ||
						articleUrl.includes('v.redd.it') ||
						articleUrl.includes('preview.redd.it'));
				const isExternalLink = articleUrl && !isRedditMedia;
				return {
					title: post.data.title || '',
					url: isExternalLink ? articleUrl : discussionUrl,
					discussionUrl: isExternalLink ? discussionUrl : undefined,
					score: post.data.score,
					source: `r/${sub}`,
					date: post.data.created_utc ? post.data.created_utc * 1000 : undefined
				} as FeedItem;
			});
		})
	);

	for (const result of results) {
		if (result.status === 'fulfilled') {
			allItems.push(...result.value);
		}
	}

	return allItems.filter((item) => item.title);
}

async function fetchGitHub(languages: string[]): Promise<FeedItem[]> {
	const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
	const langs = languages.length > 0 ? languages.slice(0, 3) : [''];
	const perLang = Math.max(3, Math.floor(10 / langs.length));
	const allItems: FeedItem[] = [];

	console.log(`GitHub: fetching for languages [${langs.join(', ')}]`);

	const results = await Promise.allSettled(
		langs.map(async (lang) => {
			// Build query and encode the whole thing properly
			const query = lang
				? `created:>${since} language:${lang.toLowerCase()}`
				: `created:>${since}`;
			const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=${perLang}`;
			const res = await fetchWithTimeout(url, {
				headers: { Accept: 'application/vnd.github.v3+json', 'User-Agent': 'Difflog/1.0' }
			});
			if (!res.ok) {
				console.log(`GitHub API error for ${lang || 'general'}: ${res.status}`);
				return [];
			}
			const data = await res.json();
			console.log(`GitHub: got ${data?.items?.length || 0} repos for ${lang || 'general'}`);
			return (data?.items || []).map(
				(repo: any) =>
					({
						title: `${repo.full_name}: ${repo.description || 'No description'}`,
						url: repo.html_url,
						score: repo.stargazers_count,
						source: `GitHub${lang ? ` (${lang})` : ''}`
					}) as FeedItem
			);
		})
	);

	for (const result of results) {
		if (result.status === 'fulfilled') {
			allItems.push(...result.value);
		} else {
			console.log(`GitHub fetch rejected: ${result.reason}`);
		}
	}

	return allItems;
}

async function fetchDevTo(tags: string[]): Promise<FeedItem[]> {
	if (tags.length === 0) return [];
	const perTag = Math.max(2, Math.floor(10 / tags.length));
	const allItems: FeedItem[] = [];

	console.log(`Dev.to: fetching for tags [${tags.join(', ')}]`);

	const results = await Promise.allSettled(
		tags.map(async (tag) => {
			const url = `https://dev.to/api/articles?tag=${encodeURIComponent(tag)}&top=7&per_page=${perTag}`;
			const res = await fetchWithTimeout(url, {
				headers: {
					'User-Agent': 'Mozilla/5.0 (compatible; Difflog/1.0)',
					Accept: 'application/json'
				}
			});
			if (!res.ok) {
				const body = await res.text();
				console.log(`Dev.to API error for ${tag}: ${res.status} - ${body.slice(0, 200)}`);
				return [];
			}
			const articles = await res.json();
			if (!Array.isArray(articles)) {
				console.log(`Dev.to returned non-array for ${tag}`);
				return [];
			}
			console.log(`Dev.to: got ${articles.length} articles for ${tag}`);
			return articles.map(
				(article: any) =>
					({
						title: article.title || '',
						url: article.url,
						score: article.positive_reactions_count,
						source: `Dev.to`
					}) as FeedItem
			);
		})
	);

	for (const result of results) {
		if (result.status === 'fulfilled') {
			allItems.push(...result.value);
		} else {
			console.log(`Dev.to fetch rejected: ${result.reason}`);
		}
	}

	return allItems.filter((item) => item.title);
}

const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type'
};

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = (await request.json()) as Profile;

		const subreddits = getSubreddits(body);
		const devtoTags = getDevToTags(body);
		const lobstersTags = getLobstersTags(body);

		// Fetch all feeds in parallel
		const [hn, lobsters, reddit, github, devto] = await Promise.allSettled([
			fetchHackerNews(),
			fetchLobsters(lobstersTags),
			fetchReddit(subreddits),
			fetchGitHub(body.languages || []),
			fetchDevTo(devtoTags)
		]);

		// Filter to last 7 days
		const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
		const filterRecent = (items: FeedItem[]) =>
			items.filter((item) => !item.date || item.date >= cutoff);

		const hnItems = filterRecent(hn.status === 'fulfilled' ? hn.value : []);
		const lobstersItems = filterRecent(lobsters.status === 'fulfilled' ? lobsters.value : []);
		const redditItems = filterRecent(reddit.status === 'fulfilled' ? reddit.value : []);
		const githubItems = github.status === 'fulfilled' ? github.value : [];
		const devtoItems = devto.status === 'fulfilled' ? devto.value : [];

		// Return items grouped by source for client-side curation
		return new Response(
			JSON.stringify({
				feeds: {
					hn: hnItems,
					lobsters: lobstersItems,
					reddit: redditItems,
					github: githubItems,
					devto: devtoItems
				}
			}),
			{
				headers: { ...corsHeaders, 'Content-Type': 'application/json' }
			}
		);
	} catch (error) {
		return new Response(
			JSON.stringify({
				items: 0,
				context: '',
				error: 'Failed to fetch feeds'
			}),
			{
				status: 200, // Return 200 with empty context so client can proceed
				headers: { ...corsHeaders, 'Content-Type': 'application/json' }
			}
		);
	}
};

export const OPTIONS: RequestHandler = async () => {
	return new Response(null, {
		headers: corsHeaders
	});
};
