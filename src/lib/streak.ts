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
 */
export function getStreakCalendar(startDateStr: string | null, activeDates: string[]): CalendarMonth[] {
    const activeSet = new Set(activeDates);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // The actual first diff date (for gap calculation)
    let firstDiff = new Date(today);
    if (startDateStr) {
        firstDiff = new Date(startDateStr);
        firstDiff.setHours(0, 0, 0, 0);
    }

    // Start of week containing first diff
    const earliest = new Date(firstDiff);
    earliest.setDate(earliest.getDate() - earliest.getDay());

    // End of current week (Saturday)
    const weekEnd = new Date(today);
    weekEnd.setDate(today.getDate() + (6 - today.getDay()));

    const months: CalendarMonth[] = [];
    let currentMonth = -1;
    let currentWeeks: CalendarWeek[] = [];

    const iter = new Date(earliest);

    while (iter <= weekEnd) {
        // Start new month if needed
        if (iter.getMonth() !== currentMonth) {
            if (currentWeeks.length > 0) {
                const prevMonth = new Date(iter);
                prevMonth.setMonth(prevMonth.getMonth() - 1);
                months.push({
                    monthLabel: prevMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
                    weeks: currentWeeks
                });
            }
            currentMonth = iter.getMonth();
            currentWeeks = [];
        }

        // Build week
        const week: CalendarWeek = [];
        for (let i = 0; i < 7; i++) {
            const iso = toLocalDateString(iter);
            const isActive = activeSet.has(iso);
            const isToday = iter.getTime() === today.getTime();
            const isOutside = iter.getMonth() !== currentMonth;

            week.push({
                date: new Date(iter),
                iso,
                isActive,
                isGap: !isActive && iter >= firstDiff && iter <= today && !isOutside,
                isToday,
                isOutside,
                label: iter.getDate().toString()
            });

            iter.setDate(iter.getDate() + 1);
        }
        currentWeeks.push(week);
    }

    // Add final month
    if (currentWeeks.length > 0) {
        const lastMonth = new Date(iter);
        lastMonth.setDate(lastMonth.getDate() - 1);
        months.push({
            monthLabel: lastMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
            weeks: currentWeeks
        });
    }

    // Reverse so most recent month is first
    return months.reverse().map(m => ({ ...m, weeks: m.weeks.reverse() }));
}
