import { parseBlocks } from './markdown';

export interface Article {
	heading: string;
	body: string;
	category?: string;
	pIndex?: number;
}

function stripMarkdown(text: string): string {
	return text
		.replace(/\*\*/g, '')
		.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
		.trim();
}

export function stripEmojiPrefix(text: string): string {
	return text
		.replace(/^(?:[\p{Extended_Pictographic}\p{Emoji_Component}\u200D\uFE0E\uFE0F\s])+/u, '')
		.trim();
}

export function extractArticles(content: string): Article[] {
	const blocks = parseBlocks(content);
	const articles: Article[] = [];
	let currentCategory: string | undefined;
	let pIndex = 0;

	// Track H3-based article accumulation
	let h3Heading: string | undefined;
	let h3Body: string[] = [];
	let h3PIndex: number | undefined;

	function flushH3() {
		if (h3Heading) {
			articles.push({ heading: h3Heading, body: h3Body.join(' '), category: currentCategory, pIndex: h3PIndex });
			h3Heading = undefined;
			h3Body = [];
			h3PIndex = undefined;
		}
	}

	for (const block of blocks) {
		switch (block.type) {
			case 'h1':
			case 'hr':
				break;
			case 'h2':
				flushH3();
				currentCategory = stripEmojiPrefix(block.content!);
				break;
			case 'h3':
				flushH3();
				h3Heading = stripMarkdown(block.content!);
				h3Body = [];
				h3PIndex = undefined;
				break;
			case 'paragraph':
				if (h3Heading) {
					const stripped = stripMarkdown(block.content!);
					if (stripped) h3Body.push(stripped);
					if (h3PIndex === undefined) h3PIndex = pIndex;
				}
				pIndex++;
				break;
			case 'list':
				if (h3Heading) {
					for (const item of block.items!) {
						const stripped = stripMarkdown(item);
						if (stripped) h3Body.push(stripped);
						if (h3PIndex === undefined) h3PIndex = pIndex;
						pIndex++;
					}
				} else {
					for (const item of block.items!) {
						const itemPIndex = pIndex;
						pIndex++;
						// parseBlocks strips the `- ` prefix, so match bold heading directly
						const bulletMatch = item.match(/^\*\*(?:\[([^\]]+)\]\([^)]*\)|([^*]+))\*\*(.*)$/);
						if (bulletMatch) {
							const heading = (bulletMatch[1] || bulletMatch[2]).trim();
							const body = stripMarkdown(bulletMatch[3] || '')
								.replace(/^\s*(?:\([^)]*\)\s*)?[—–-]\s*/, '')
								.trim();
							articles.push({ heading, body, category: currentCategory, pIndex: itemPIndex });
						}
					}
				}
				break;
		}
	}

	flushH3();
	return articles;
}

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function escapeRegex(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function highlightTerms(text: string, query: string): string {
	const terms = query.split(/\s+/).filter(Boolean);
	if (terms.length === 0) return escapeHtml(text);

	const escaped = escapeHtml(text);
	const pattern = terms.map(escapeRegex).join('|');
	const regex = new RegExp(`(${pattern})`, 'gi');
	return escaped.replace(regex, '<mark>$1</mark>');
}

export function getSnippet(body: string, query: string, maxLen = 120): string | null {
	if (!body) return null;

	const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
	if (terms.length === 0) return null;

	const lower = body.toLowerCase();
	let earliest = -1;
	for (const term of terms) {
		const idx = lower.indexOf(term);
		if (idx !== -1 && (earliest === -1 || idx < earliest)) {
			earliest = idx;
		}
	}
	if (earliest === -1) return null;

	const half = Math.floor(maxLen / 2);
	let start = Math.max(0, earliest - half);
	let end = Math.min(body.length, earliest + half);

	// Snap to word boundaries
	if (start > 0) {
		const space = body.indexOf(' ', start);
		if (space !== -1 && space < earliest) start = space + 1;
	}
	if (end < body.length) {
		const space = body.lastIndexOf(' ', end);
		if (space > earliest) end = space;
	}

	let snippet = body.slice(start, end);
	if (start > 0) snippet = '\u2026' + snippet;
	if (end < body.length) snippet = snippet + '\u2026';

	// Append context for terms not visible in the primary window
	const windowLower = lower.slice(start, end);
	for (const term of terms) {
		if (windowLower.includes(term)) continue;
		const idx = lower.indexOf(term);
		if (idx === -1) continue;
		snippet += ' ' + wordContext(body, idx, term.length) + '\u2026';
	}

	return snippet;
}

function wordContext(text: string, matchIdx: number, termLen: number, nWords = 2): string {
	let s = matchIdx;
	let spaces = 0;
	while (s > 0 && spaces < nWords) {
		s--;
		if (text[s] === ' ') spaces++;
	}
	if (s > 0) s++;

	let e = matchIdx + termLen;
	spaces = 0;
	while (e < text.length && spaces < nWords) {
		if (text[e] === ' ') spaces++;
		e++;
	}

	return text.slice(s, e).trim();
}

/** Best match quality of a term against text: full word=5, start-of-word=3, substring=1, none=0 */
function matchQuality(term: string, text: string): number {
	const lower = text.toLowerCase();
	let best = 0;
	let idx = lower.indexOf(term);

	while (idx !== -1) {
		const before = idx === 0 || /\W/.test(lower[idx - 1]);
		const after = idx + term.length >= lower.length || /\W/.test(lower[idx + term.length]);

		if (before && after) return 5;
		if (before && best < 3) best = 3;
		else if (best < 1) best = 1;

		idx = lower.indexOf(term, idx + 1);
	}

	return best;
}

/** Sum of match quality across all terms */
function scoreText(terms: string[], text: string): number {
	let total = 0;
	for (const term of terms) {
		total += matchQuality(term, text);
	}
	return total;
}

/** Best single-term match quality (for tier sorting) */
function bestTermQuality(terms: string[], text: string): number {
	let best = 0;
	for (const term of terms) {
		best = Math.max(best, matchQuality(term, text));
	}
	return best;
}

interface Searchable {
	title?: string;
	content: string;
}

export function matchArticles<T extends Searchable>(items: T[], query: string): { item: T; matches: Article[] }[] {
	const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
	if (terms.length === 0) return [];

	const scored: { item: T; matches: Article[]; bestTier: number; totalScore: number }[] = [];
	for (const item of items) {
		const title = (item.title || '').toLowerCase();
		const articles = extractArticles(item.content);
		const titleMatches = terms.every(t => title.includes(t));

		// Articles matching on own content only (no title boost)
		const contentMatches = articles.filter(a => {
			const text = `${a.heading} ${a.body} ${a.category || ''}`.toLowerCase();
			return terms.every(t => text.includes(t));
		});

		// Articles matching with title included (cross-matching)
		const crossMatches = articles.filter(a => {
			const text = `${a.heading} ${a.body} ${a.category || ''} ${title}`.toLowerCase();
			return terms.every(t => text.includes(t));
		});

		// When title alone covers all terms, only show articles that match
		// on their own content — don't inflate results with every article
		const matchingArticles = titleMatches ? contentMatches : crossMatches;

		if (matchingArticles.length > 0 || titleMatches) {
			const titleText = item.title || '';
			let bestTier = titleMatches ? bestTermQuality(terms, titleText) : 0;
			let totalScore = titleMatches ? scoreText(terms, titleText) : 0;

			for (const a of matchingArticles) {
				const articleText = `${a.heading} ${a.body} ${a.category || ''}`;
				bestTier = Math.max(bestTier, bestTermQuality(terms, articleText));
				totalScore += scoreText(terms, articleText);
			}

			scored.push({ item, matches: matchingArticles, bestTier, totalScore });
		}
	}

	// Sort: best tier desc → total score desc → preserve input order (newest first)
	scored.sort((a, b) => {
		if (a.bestTier !== b.bestTier) return b.bestTier - a.bestTier;
		if (a.totalScore !== b.totalScore) return b.totalScore - a.totalScore;
		return 0;
	});

	return scored.map(({ item, matches }) => ({ item, matches }));
}
