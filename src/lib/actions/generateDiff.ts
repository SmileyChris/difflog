/**
 * Core diff generation logic extracted from +page.svelte.
 * Handles the orchestration of feed fetching, AI synthesis, and content processing.
 */
import type { Diff } from '$lib/stores/history.svelte';
import { buildPrompt, type DiffPrompt } from '$lib/utils/prompt';
import type { ResolvedMapping, ApiKeys } from '$lib/utils/sync';
import { getUnmappedItems, resolveSourcesForItem, curateGeneralFeeds, formatItemsForPrompt, formatWebSearchForPrompt, type FeedItem } from '$lib/utils/feeds';
import { searchWeb } from '$lib/utils/search';
import { synthesizeDiff } from '$lib/utils/llm';
import { DEPTH_TOKEN_LIMITS, type GenerationDepth } from '$lib/utils/constants';

export interface GenerateOptions {
	profile: {
		name: string;
		languages: string[];
		frameworks: string[];
		tools: string[];
		topics: string[];
		depth: GenerationDepth;
		resolvedMappings?: Record<string, ResolvedMapping>;
		providerSelections?: { search?: string; curation?: string; synthesis?: string };
		apiKeys?: Partial<ApiKeys>;
	};
	selectedDepth: GenerationDepth;
	lastDiffDate: string | null;
	lastDiffContent?: string;
	onMappingsResolved?: (mappings: Record<string, unknown>) => void;
}

export interface GenerateResult {
	diff: Diff;
}

// Stage cache for resume-from-failure
let _stageCache: {
	timestamp: number;
	profileHash: string;
	feedContext: string;
	webContext: string;
	prompt: DiffPrompt;
} | null = null;

const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

function computeProfileHash(options: GenerateOptions): string {
	const { profile, selectedDepth } = options;
	return JSON.stringify({
		languages: profile.languages,
		frameworks: profile.frameworks,
		tools: profile.tools,
		topics: profile.topics,
		depth: selectedDepth
	});
}

function isCacheValid(options: GenerateOptions): boolean {
	if (!_stageCache) return false;
	if (Date.now() - _stageCache.timestamp > CACHE_TTL) return false;
	return _stageCache.profileHash === computeProfileHash(options);
}

export function hasStageCache(): boolean {
	return _stageCache !== null;
}

export function clearStageCache(): void {
	_stageCache = null;
}

/**
 * Calculate the time window in days based on last diff date.
 */
function calculateWindowDays(lastDiffDate: string | null): number {
	if (!lastDiffDate) return 7;
	const daysSince = Math.ceil((Date.now() - new Date(lastDiffDate).getTime()) / 86400000);
	return Math.min(Math.max(daysSince, 1), 7);
}

/**
 * Clean the raw diff content by removing preamble and normalizing entities.
 */
function cleanDiffContent(rawContent: string): string {
	let content = rawContent;

	// Strip any echoed date/Intelligence Window line the model may have produced
	const dateStart = content.indexOf('Intelligence Window');
	if (dateStart >= 0) {
		// Find the line start
		let lineStart = content.lastIndexOf('\n', dateStart);
		lineStart = lineStart >= 0 ? lineStart + 1 : 0;
		// Find the end of the date block (skip trailing --- separator)
		let lineEnd = content.indexOf('\n', dateStart);
		if (lineEnd < 0) lineEnd = content.length;
		// Check for --- separator after the date line
		const afterDate = content.slice(lineEnd).replace(/^\n+/, '');
		if (afterDate.startsWith('---')) {
			lineEnd = lineEnd + content.slice(lineEnd).indexOf('---') + 3;
		}
		content = content.slice(0, lineStart) + content.slice(lineEnd).replace(/^\n+/, '');
	}

	// Decode HTML entities that some models (e.g. Gemini) emit instead of plain Unicode
	content = content
		.replace(/&middot;/g, '·')
		.replace(/&mdash;/g, '—')
		.replace(/&ndash;/g, '–')
		.replace(/&rarr;/g, '→')
		.replace(/&larr;/g, '←')
		.replace(/&bull;/g, '•')
		.replace(/&hellip;/g, '…')
		.replace(/&amp;/g, '&');

	return content.trim();
}

/**
 * Generate a new diff based on the user's profile and preferences.
 * This orchestrates the entire generation pipeline.
 */
export async function generateDiffContent(options: GenerateOptions): Promise<GenerateResult> {
	const { profile, selectedDepth, lastDiffDate, lastDiffContent, onMappingsResolved } = options;
	const startTime = Date.now();

	const keys: ApiKeys = {
		anthropic: profile.apiKeys?.anthropic,
		serper: profile.apiKeys?.serper,
		perplexity: profile.apiKeys?.perplexity,
		deepseek: profile.apiKeys?.deepseek,
		gemini: profile.apiKeys?.gemini
	};

	let prompt: DiffPrompt;
	const canResume = isCacheValid(options) && _stageCache?.prompt;

	if (canResume && _stageCache) {
		// Resume from cache — skip feed/search/prompt stages
		prompt = _stageCache.prompt;
	} else {
		// Clear stale cache and run full pipeline
		_stageCache = null;

		// Resolve unmapped custom items
		let currentProfile = profile;
		const unmapped = getUnmappedItems(profile);
		if (unmapped.length > 0 && keys.anthropic) {
			console.log(`Resolving ${unmapped.length} custom item(s):`, unmapped.map((u) => u.item));
			const newMappings = { ...profile.resolvedMappings };
			for (const { item, category } of unmapped) {
				const mapping = await resolveSourcesForItem(keys, item, category);
				newMappings[item] = mapping;
				console.log(`Resolved "${item}":`, mapping);
			}
			onMappingsResolved?.(newMappings);
			currentProfile = { ...profile, resolvedMappings: newMappings };
		}

		const windowDays = calculateWindowDays(lastDiffDate);

		// Fetch feeds and web search in parallel
		const [webSearchResults, feedRes] = await Promise.all([
			searchWeb(keys, currentProfile, windowDays, profile.providerSelections?.search).catch(() => []),
			fetch('/api/feeds', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					languages: currentProfile.languages || [],
					frameworks: currentProfile.frameworks || [],
					tools: currentProfile.tools || [],
					topics: currentProfile.topics || [],
					resolvedMappings: currentProfile.resolvedMappings || {}
				})
			}).catch(() => null)
		]);

		// Process feed data
		let feedContext = '';
		if (feedRes?.ok) {
			try {
				const feedData = (await feedRes.json()) as { feeds: Record<string, FeedItem[]> };
				const feeds = feedData.feeds || {};

				const generalItems: FeedItem[] = [...(feeds.hn || []), ...(feeds.lobsters || [])];
				let curatedGeneral: FeedItem[] = generalItems;
				if (generalItems.length > 0) {
					curatedGeneral = await curateGeneralFeeds(keys, generalItems, currentProfile, profile.providerSelections?.curation);
				}

				const allItems: FeedItem[] = [
					...curatedGeneral,
					...(feeds.reddit || []),
					...(feeds.github || []),
					...(feeds.devto || [])
				];

				feedContext = formatItemsForPrompt(allItems);
			} catch {
				// Feed processing failed, continue without feed context
			}
		}

		// Process web search results
		const webContext = webSearchResults.length > 0
			? formatWebSearchForPrompt(webSearchResults)
			: '';

		// Build prompt
		prompt = buildPrompt(
			{ ...currentProfile, depth: selectedDepth },
			feedContext,
			lastDiffDate ?? undefined,
			lastDiffContent,
			webContext
		);

		// Cache intermediate results before synthesis
		_stageCache = {
			timestamp: Date.now(),
			profileHash: computeProfileHash(options),
			feedContext,
			webContext,
			prompt
		};
	}

	const synthesisProvider = profile.providerSelections?.synthesis || 'anthropic';
	const maxTokens = DEPTH_TOKEN_LIMITS[selectedDepth] || 8192;

	const { title, content: rawContent, cost } = await synthesizeDiff(
		keys,
		synthesisProvider,
		prompt,
		maxTokens
	);

	// Clear cache on successful synthesis
	_stageCache = null;

	const cleanedContent = cleanDiffContent(rawContent);

	const entry: Diff = {
		id: Date.now().toString(),
		title: title || '',
		content: cleanedContent,
		generated_at: new Date().toISOString(),
		duration_seconds: Math.round((Date.now() - startTime) / 1000),
		cost,
		window_days: calculateWindowDays(lastDiffDate)
	};

	return { diff: entry };
}
