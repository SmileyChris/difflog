import { persist } from './persist.svelte';
import { activeProfileId } from './profiles.svelte';
import { getHistory } from './history.svelte';
import { renderMarkdown } from '$lib/utils/markdown';
import { starId, type Star, type Diff } from '$lib/utils/sync';

// Persisted state
const _bookmarks = persist<Record<string, Star[]>>('difflog-bookmarks', {});

// State accessors
export const bookmarks = {
	get value() { return _bookmarks.value; },
	set value(val: Record<string, Star[]>) { _bookmarks.value = val; }
};

// Derived state helpers
export function getStars(): Star[] {
	return activeProfileId.value ? _bookmarks.value[activeProfileId.value] ?? [] : [];
}

export function getStarCountLabel(): string {
	const count = getStars().length;
	return `${count} ${count === 1 ? 'Star' : 'Stars'}`;
}

// Internal helper
function setStars(val: Star[]): void {
	if (activeProfileId.value) {
		_bookmarks.value = { ..._bookmarks.value, [activeProfileId.value]: val };
	}
}

// Base mutations (no sync tracking — use operations.svelte.ts addStar/removeStar instead)
export function addStarBase(entry: Star): void {
	const stars = getStars();
	setStars([entry, ...stars]);
}

export function removeStarBase(diffId: string, pIndex: number): void {
	const stars = getStars();
	setStars(stars.filter((s: Star) => !(s.diff_id === diffId && s.p_index === pIndex)));
}

export function removeStarsForDiff(diffId: string): Star[] {
	const stars = getStars();
	const toRemove = stars.filter((s: Star) => s.diff_id === diffId);
	setStars(stars.filter((s: Star) => s.diff_id !== diffId));
	return toRemove;
}

export function isStarred(diffId: string, pIndex: number): boolean {
	const stars = getStars();
	return stars.some((s: Star) => s.diff_id === diffId && s.p_index === pIndex);
}

export function getStarContent(star: Star): { html: string; content: string; diff_title: string; diff_date: string } | null {
	const history = getHistory();
	const diff = history.find((d: Diff) => d.id === star.diff_id);
	if (!diff) return null;

	const html = renderMarkdown(diff.content);
	const container = document.createElement('div');
	container.innerHTML = html;
	const element = container.querySelector(`[data-p="${star.p_index}"]`);
	if (!element) return null;

	return {
		html: element.outerHTML,
		content: element.textContent || '',
		diff_title: diff.title || 'Untitled Diff',
		diff_date: diff.generated_at
	};
}

// Initialize stars for a profile
export function initStarsForProfile(id: string): void {
	if (!_bookmarks.value[id]) {
		_bookmarks.value = { ..._bookmarks.value, [id]: [] };
	}
}

// Clean up stars for a deleted profile
export function deleteStarsForProfile(id: string): void {
	const { [id]: _, ...rest } = _bookmarks.value;
	_bookmarks.value = rest;
}

// Re-export types and helpers
export type { Star };
export { starId };
