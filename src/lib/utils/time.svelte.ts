import { getNow } from '$lib/stores/tick.svelte';

/**
 * Returns a human-readable relative time string.
 * Reads the reactive tick so $derived / template expressions auto-update.
 */
export function timeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date(getNow());
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const midnightNow = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const midnightDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((midnightNow.getTime() - midnightDate.getTime()) / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString();
}

/**
 * Format a date string with specified options
 */
export function formatDate(dateStr: string, options?: Intl.DateTimeFormatOptions): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', options);
}

/**
 * Check if a date string is today
 */
export function isToday(dateStr: string): boolean {
  return new Date(dateStr).toDateString() === new Date().toDateString();
}

/**
 * Get the number of days since a date
 */
export function daysSince(dateStr: string): number {
  const diffMs = getNow() - new Date(dateStr).getTime();
  return Math.floor(diffMs / 86400000);
}

/**
 * Get current date formatted for display
 */
export function getCurrentDateFormatted(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}
