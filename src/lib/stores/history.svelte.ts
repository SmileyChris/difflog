import { persist } from './persist.svelte';
import { activeProfileId } from './profiles.svelte';
import { renderMarkdown } from '$lib/utils/markdown';
import { calculateStreak, getStreakCalendar, type StreakResult, type CalendarMonth } from '$lib/utils/streak';
import type { Diff } from '$lib/utils/sync';

// Persisted state
const _histories = persist<Record<string, Diff[]>>('difflog-histories', {});

// State accessors
export const histories = {
	get value() { return _histories.value; },
	set value(val: Record<string, Diff[]>) { _histories.value = val; }
};

// Derived state helpers
export function getHistory(): Diff[] {
	return activeProfileId.value ? _histories.value[activeProfileId.value] ?? [] : [];
}

export function getStreak(): StreakResult {
	const history = getHistory();
	const dates = history.map((d: Diff) => new Date(d.generated_at));
	return calculateStreak(dates);
}

export function getStreakCalendarData(): CalendarMonth[] {
	const streak = getStreak();
	const history = getHistory();
	const diffCounts = new Map<string, number>();
	for (const diff of history) {
		const d = new Date(diff.generated_at);
		const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
		diffCounts.set(iso, (diffCounts.get(iso) || 0) + 1);
	}
	return getStreakCalendar(streak.startDate, diffCounts);
}

// Internal helper
function setHistory(val: Diff[]): void {
	if (activeProfileId.value) {
		_histories.value = { ..._histories.value, [activeProfileId.value]: val };
	}
}

// Actions
export function addDiff(entry: Diff): void {
	const history = getHistory();
	setHistory([entry, ...history].slice(0, 50));
}

export function deleteDiff(id: string): void {
	const history = getHistory();
	setHistory(history.filter((d: Diff) => d.id !== id));
}

export function updateDiff(id: string, updates: Partial<Diff>): void {
	const history = getHistory();
	const idx = history.findIndex((d) => d.id === id);
	if (idx !== -1) {
		history[idx] = { ...history[idx], ...updates };
		setHistory([...history]);
	}
}

export function renderDiff(diff: Diff): string {
	if (!diff?.content) return '';
	return renderMarkdown(diff.content);
}

// Initialize history for a profile (called from profiles module)
export function initHistoryForProfile(id: string): void {
	if (!_histories.value[id]) {
		_histories.value = { ..._histories.value, [id]: [] };
	}
}

// Clean up history for a deleted profile
export function deleteHistoryForProfile(id: string): void {
	const { [id]: _, ...rest } = _histories.value;
	_histories.value = rest;
}

// Re-export types
export type { Diff, StreakResult, CalendarMonth };
