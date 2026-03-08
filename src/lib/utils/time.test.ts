import { expect, test, describe } from 'bun:test';
import { timeAgoFrom, formatDate, isToday, daysSinceFrom, formatDiffDate } from './time';

describe('time.ts', () => {
  describe('timeAgoFrom', () => {
    const base = new Date('2026-03-09T12:00:00').getTime();

    test('"just now" for < 1 minute', () => {
      const dateStr = new Date(base - 30_000).toISOString(); // 30s ago
      expect(timeAgoFrom(dateStr, base)).toBe('just now');
    });

    test('"X min ago" for 1-59 minutes', () => {
      expect(timeAgoFrom(new Date(base - 60_000).toISOString(), base)).toBe('1 min ago');
      expect(timeAgoFrom(new Date(base - 45 * 60_000).toISOString(), base)).toBe('45 min ago');
    });

    test('"1 hour ago" singular', () => {
      expect(timeAgoFrom(new Date(base - 3_600_000).toISOString(), base)).toBe('1 hour ago');
    });

    test('"X hours ago" plural', () => {
      expect(timeAgoFrom(new Date(base - 5 * 3_600_000).toISOString(), base)).toBe('5 hours ago');
    });

    test('"yesterday" for 1 day', () => {
      // Use midnight math — go back to yesterday same time
      const yesterday = new Date(base - 86_400_000).toISOString();
      expect(timeAgoFrom(yesterday, base)).toBe('yesterday');
    });

    test('"X days ago" for 2-6 days', () => {
      const threeDaysAgo = new Date(base - 3 * 86_400_000).toISOString();
      expect(timeAgoFrom(threeDaysAgo, base)).toBe('3 days ago');
    });

    test('falls back to toLocaleDateString for 7+ days', () => {
      const tenDaysAgo = new Date(base - 10 * 86_400_000);
      const result = timeAgoFrom(tenDaysAgo.toISOString(), base);
      // Should be a locale date string, not a relative time
      expect(result).not.toContain('ago');
      expect(result).not.toBe('just now');
    });
  });

  describe('formatDate', () => {
    test('default formatting', () => {
      const result = formatDate('2026-03-09');
      expect(result).toBeString();
      expect(result).toContain('2026');
    });

    test('custom options', () => {
      const result = formatDate('2026-03-09', { month: 'short', day: 'numeric' });
      expect(result).toContain('Mar');
      expect(result).toContain('9');
    });
  });

  describe('isToday', () => {
    test('today returns true', () => {
      expect(isToday(new Date().toISOString())).toBe(true);
    });

    test('yesterday returns false', () => {
      const yesterday = new Date(Date.now() - 86_400_000).toISOString();
      expect(isToday(yesterday)).toBe(false);
    });
  });

  describe('daysSinceFrom', () => {
    test('0 days for same day', () => {
      const now = Date.now();
      expect(daysSinceFrom(new Date(now).toISOString(), now)).toBe(0);
    });

    test('N days ago', () => {
      const now = Date.now();
      const threeDaysAgo = new Date(now - 3 * 86_400_000).toISOString();
      expect(daysSinceFrom(threeDaysAgo, now)).toBe(3);
    });
  });

  describe('formatDiffDate', () => {
    test('without windowDays — date only', () => {
      const result = formatDiffDate('2026-01-29T12:00:00');
      expect(result).not.toContain('Past');
      expect(result).toContain('2026');
    });

    test('with windowDays=1 — "Past 24 hours"', () => {
      const result = formatDiffDate('2026-01-29T12:00:00', 1);
      expect(result).toContain('Past 24 hours');
    });

    test('with windowDays=N — "Past N days"', () => {
      const result = formatDiffDate('2026-01-29T12:00:00', 7);
      expect(result).toContain('Past 7 days');
    });
  });
});
