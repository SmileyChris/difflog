export interface StreakResult {
    streak: number;
    expiresInDays: number;
    startDate: string | null;
    activeDates: string[]; // ISO date strings (YYYY-MM-DD)
}

export interface CalendarDay {
    date: Date;
    iso: string;
    isActive: boolean;
    isGap: boolean;
    isToday: boolean;
    label: string;
}

export type CalendarWeek = CalendarDay[];

export interface CalendarMonth {
    monthLabel: string; // e.g. "January 2026"
    weeks: CalendarWeek[];
}

/**
 * Calculate streak based on unique days of activity with an 8-day tolerance.
 */
export function calculateStreak(dates: Date[]): StreakResult {
    if (!dates.length) return { streak: 0, expiresInDays: 0, startDate: null, activeDates: [] };

    // Sort dates descending
    const sortedDates = [...dates].sort((a, b) => b.getTime() - a.getTime());

    // Normalize to unique days (midnight) for logic
    const uniqueTimes = Array.from(new Set(
        sortedDates
            .map(d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime())
    )).sort((a, b) => b - a);

    const uniqueDays = uniqueTimes.map(time => new Date(time));

    if (uniqueDays.length === 0) return { streak: 0, expiresInDays: 0, startDate: null, activeDates: [] };

    const latest = uniqueDays[0];
    const now = new Date();
    const midnightNow = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const daysSinceLatest = Math.floor((midnightNow.getTime() - latest.getTime()) / 86400000);

    // If > 8 days since latest, streak is broken immediately.
    if (daysSinceLatest > 8) {
        return { streak: 0, expiresInDays: 0, startDate: null, activeDates: [] };
    }

    // Calculate streak based on original counts falling on active days

    // Find valid chain of days first
    const activeDayTimes = new Set<number>();
    activeDayTimes.add(latest.getTime());

    let currentDay = latest;

    for (let i = 0; i < uniqueDays.length - 1; i++) {
        const next = uniqueDays[i + 1];
        const diffTime = currentDay.getTime() - next.getTime();
        const diffDays = Math.round(diffTime / 86400000);

        if (diffDays <= 8) {
            activeDayTimes.add(next.getTime());
            currentDay = next;
        } else {
            break;
        }
    }

    // Count total diffs that happened on these active days
    const streak = dates.reduce((count, date) => {
        const midnight = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
        return activeDayTimes.has(midnight) ? count + 1 : count;
    }, 0);

    // The last added date is the start date (oldest active day)
    // We need to find the specific active day that is smallest
    const sortedActive = Array.from(activeDayTimes).sort((a, b) => a - b);
    const startDate = new Date(sortedActive[0]);

    return {
        streak,
        expiresInDays: 8 - daysSinceLatest,
        startDate: startDate.toISOString(),
        // activeDates should be strings YYYY-MM-DD
        activeDates: Array.from(activeDayTimes).map(t => new Date(t).toISOString().split('T')[0])
    };
}

/**
 * Generate calendar grid data for the current week.
 * Returns array with single month containing the current week.
 */
export function getStreakCalendar(startDateStr: string | null, activeDates: string[]): CalendarMonth[] {
    const activeSet = new Set(activeDates);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Start of current week (Sunday)
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay());

    // End of current week (Saturday)
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    const monthLabel = today.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const week: CalendarWeek = [];
    const iter = new Date(weekStart);

    for (let i = 0; i < 7; i++) {
        const iso = iter.toISOString().split('T')[0];
        const isActive = activeSet.has(iso);
        const isToday = iter.getTime() === today.getTime();

        week.push({
            date: new Date(iter),
            iso,
            isActive,
            isGap: !isActive && iter <= today,
            isToday,
            label: iter.getDate().toString()
        });

        iter.setDate(iter.getDate() + 1);
    }

    return [{ monthLabel, weeks: [week] }];
}
