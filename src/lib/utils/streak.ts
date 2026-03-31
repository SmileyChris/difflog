/** Number of days without activity before a streak is considered broken */
export const STREAK_TOLERANCE_DAYS = 8;

/** Milliseconds in a day (24 * 60 * 60 * 1000) */
export const MS_PER_DAY = 86400000;

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
    isOutside: boolean;
    label: string;
    diffCount: number;
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

    const daysSinceLatest = Math.floor((midnightNow.getTime() - latest.getTime()) / MS_PER_DAY);

    // If > tolerance days since latest, streak is broken immediately.
    if (daysSinceLatest > STREAK_TOLERANCE_DAYS) {
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
        const diffDays = Math.round(diffTime / MS_PER_DAY);

        if (diffDays <= STREAK_TOLERANCE_DAYS) {
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
        expiresInDays: STREAK_TOLERANCE_DAYS - daysSinceLatest,
        startDate: startDate.toISOString(),
        // activeDates as YYYY-MM-DD in local timezone
        activeDates: Array.from(activeDayTimes).map(t => {
            const d = new Date(t);
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        })
    };
}

/** Format date as YYYY-MM-DD in local timezone */
function toLocalDateString(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Generate calendar grid data from streak start to today.
 * Groups weeks by month.
 * @param startDateStr - ISO date string of the first diff
 * @param diffCounts - Map of ISO date strings (YYYY-MM-DD) to diff counts
 */
export function getStreakCalendar(startDateStr: string | null, diffCounts: Map<string, number>): CalendarMonth[] {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let firstDiff = new Date(today);
    if (startDateStr) {
        firstDiff = new Date(startDateStr);
        firstDiff.setHours(0, 0, 0, 0);
    }

    // Collect the distinct months we need to show
    const startMonth = new Date(firstDiff.getFullYear(), firstDiff.getMonth(), 1);
    const endMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    // Week containing the first diff (clip start of oldest month)
    const earliestWeekStart = new Date(firstDiff);
    earliestWeekStart.setDate(earliestWeekStart.getDate() - earliestWeekStart.getDay());

    // Week containing today (clip end of newest month)
    const latestWeekEnd = new Date(today);
    latestWeekEnd.setDate(today.getDate() + (6 - today.getDay()));

    const months: CalendarMonth[] = [];
    const monthIter = new Date(startMonth);

    while (monthIter <= endMonth) {
        const month = monthIter.getMonth();
        const year = monthIter.getFullYear();
        const label = monthIter.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

        // First day of month, back to its Sunday
        const monthStart = new Date(year, month, 1);
        const gridStart = new Date(monthStart);
        gridStart.setDate(gridStart.getDate() - gridStart.getDay());

        // Last day of month, forward to its Saturday
        const monthEnd = new Date(year, month + 1, 0);
        const gridEnd = new Date(monthEnd);
        gridEnd.setDate(gridEnd.getDate() + (6 - gridEnd.getDay()));

        // Clip: oldest month starts from the week containing firstDiff
        const weekStart = monthIter.getTime() === startMonth.getTime()
            ? new Date(Math.max(gridStart.getTime(), earliestWeekStart.getTime()))
            : gridStart;

        // Clip: newest month ends at the week containing today
        const weekEnd = monthIter.getTime() === endMonth.getTime()
            ? new Date(Math.min(gridEnd.getTime(), latestWeekEnd.getTime()))
            : gridEnd;

        const weeks: CalendarWeek[] = [];
        const iter = new Date(weekStart);

        while (iter <= weekEnd) {
            const week: CalendarWeek = [];
            for (let i = 0; i < 7; i++) {
                const iso = toLocalDateString(iter);
                const count = diffCounts.get(iso) || 0;
                const isActive = count > 0;
                const isToday = iter.getTime() === today.getTime();
                const isOutside = iter.getMonth() !== month;

                week.push({
                    date: new Date(iter),
                    iso,
                    isActive,
                    isGap: !isActive && iter >= firstDiff && iter <= today && !isOutside,
                    isToday,
                    isOutside,
                    label: iter.getDate().toString(),
                    diffCount: count
                });

                iter.setDate(iter.getDate() + 1);
            }
            weeks.push(week);
        }

        if (weeks.length > 0) {
            months.push({ monthLabel: label, weeks });
        }

        monthIter.setMonth(monthIter.getMonth() + 1);
    }

    // Reverse so most recent month/week is first
    return months.reverse().map(m => ({ ...m, weeks: m.weeks.reverse() }));
}
