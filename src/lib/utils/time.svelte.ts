/**
 * Reactive time utilities — reads getNow() so Svelte $derived expressions auto-update.
 * Pure (non-reactive) helpers are re-exported from time.ts.
 */
import { getNow } from '$lib/stores/tick.svelte';
import { timeAgoFrom, daysSinceFrom } from './time';

export { formatDate, isToday, getCurrentDateFormatted, formatDiffDate } from './time';

/** Reactive timeAgo — auto-updates via the tick store. */
export function timeAgo(dateStr: string): string {
  return timeAgoFrom(dateStr, getNow());
}

/** Reactive daysSince — auto-updates via the tick store. */
export function daysSince(dateStr: string): number {
  return daysSinceFrom(dateStr, getNow());
}
