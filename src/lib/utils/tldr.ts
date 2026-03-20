import { completeJson, type JsonSchema } from './llm';
import type { ApiKeys } from '$lib/types/sync';

/**
 * Extract the first href from a paragraph's rendered HTML.
 */
export function extractFirstUrl(paragraphHtml: string): string | null {
	const match = paragraphHtml.match(/href="([^"]+)"/);
	return match ? match[1] : null;
}

/** Minimum chars of useful content to consider a fetch successful */
const MIN_CONTENT_LENGTH = 200;

/** Phrases that indicate Jina returned an error/blocked page instead of content */
const JUNK_MARKERS = [
	'not accessible',
	'access denied',
	'enable javascript',
	'captcha',
	'just a moment',
	'blocked',
	'sign in to',
	'log in to',
	'verify you are human',
];

function isUsefulContent(text: string): boolean {
	if (text.length < MIN_CONTENT_LENGTH) return false;
	const lower = text.toLowerCase();
	return !JUNK_MARKERS.some(marker => lower.includes(marker));
}

/**
 * Try Jina Reader API first, fall back to server-side fetch.
 * Validates that the response contains real article content.
 * Truncates to ~4000 chars to keep LLM costs low.
 */
export async function fetchArticleText(url: string): Promise<string> {
	// Try Jina Reader first
	try {
		const jinaUrl = `https://r.jina.ai/${url}`;
		const res = await fetch(jinaUrl, {
			headers: { 'Accept': 'text/plain' }
		});

		if (res.ok) {
			const text = await res.text();
			if (isUsefulContent(text)) {
				return text.slice(0, 4000);
			}
		}
	} catch {
		// Jina failed, try server-side fallback
	}

	// Fall back to server-side fetch
	const res = await fetch(`/api/fetch-article?url=${encodeURIComponent(url)}`);
	if (!res.ok) {
		throw new Error('Article content not accessible');
	}

	const data = await res.json() as { text?: string; error?: string };
	if (data.error || !data.text) {
		throw new Error('Article content not accessible');
	}

	if (!isUsefulContent(data.text)) {
		throw new Error('Article content not accessible');
	}

	return data.text.slice(0, 4000);
}

const SUMMARY_SCHEMA: JsonSchema = {
	type: 'object',
	properties: {
		summary: {
			type: 'string',
			description: '4-6 short paragraphs (1-2 sentences each) adding depth beyond the existing one-liner. Separate paragraphs with double newlines.'
		}
	},
	required: ['summary']
};

/**
 * Summarize article text using the curation LLM chain.
 * The existing diff paragraph text is included as context so the summary
 * adds depth beyond what the user already sees.
 */
export async function summarizeArticle(
	keys: ApiKeys,
	text: string,
	existingSummary: string,
	provider?: string | null
): Promise<string | null> {
	const prompt = `You are writing a TLDR for a developer news brief. The user already sees this one-liner in their diff:

"${existingSummary}"

Below is the full article text. Write 4-6 short paragraphs that go deeper than the one-liner above.

Rules:
- First paragraph: the single biggest takeaway. Lead with "so what" — why should the reader care?
- Each paragraph is 1-2 sentences max. Sentence fragments are fine. "Ships with native ARM support. 2x faster cold starts." is better than a full prose sentence.
- Use concrete details: version numbers, dates, metrics, names, benchmarks. Never vague ("significant improvement", "growing adoption").
- No filler: never write "it's worth noting", "interestingly", "notably", "it should be noted", "this is significant because".
- Do not repeat what the existing one-liner already says.

Article:
${text}`;

	const result = await completeJson<{ summary: string }>(
		keys,
		prompt,
		SUMMARY_SCHEMA,
		{ maxTokens: 768, preferredProvider: provider }
	);

	return result?.summary ?? null;
}
