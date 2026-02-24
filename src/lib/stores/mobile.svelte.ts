import { browser } from '$app/environment';
import type { Diff } from '$lib/stores/history.svelte';
import type { FlatCard } from '$lib/components/mobile/types';

// Mobile detection state
let _isMobile = $state(false);

export const isMobile = {
	get value() { return _isMobile; },
};

export function initMobileDetection(): void {
	if (!browser) return;
	const mq = window.matchMedia('(max-width: 640px)');
	_isMobile = mq.matches;
	const handler = (e: MediaQueryListEvent) => { _isMobile = e.matches; };
	mq.addEventListener('change', handler);
}

// Current diff context — set by pages that display a diff
let _currentDiff = $state<Diff | null>(null);
let _visibleCard = $state(0);
let _flatCards = $state<FlatCard[]>([]);

// Optional animated-back callback — set by pages (e.g. /regenerate) that want
// the tab bar's "current" tap to trigger a slide-out animation instead of a plain goto.
let _navigateBack = $state<(() => void) | null>(null);

// Pending slide-in direction — set before cross-route navigation so the
// incoming page knows which direction to slide in from.
let _pendingSlideIn = $state<'left' | 'right' | null>(null);

export const mobileDiff = {
	get diff() { return _currentDiff; },
	set diff(val: Diff | null) { _currentDiff = val; },
	get visibleCard() { return _visibleCard; },
	set visibleCard(val: number) { _visibleCard = val; },
	get flatCards() { return _flatCards; },
	set flatCards(val: FlatCard[]) { _flatCards = val; },
	get navigateBack() { return _navigateBack; },
	set navigateBack(val: (() => void) | null) { _navigateBack = val; },
	get pendingSlideIn() { return _pendingSlideIn; },
	set pendingSlideIn(val: 'left' | 'right' | null) { _pendingSlideIn = val; },
};
