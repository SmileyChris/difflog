import { expect, test, describe } from "bun:test";
import { calculateStreak, getStreakCalendar } from "./streak";

describe("streak.ts", () => {
    const today = new Date();
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);

    const toIso = (d: Date) => d.toISOString().split('T')[0];

    const daysAgo = (n: number) => {
        const d = new Date(today);
        d.setDate(today.getDate() - n);
        return d;
    };

    test("calculateStreak counts diffs not days", () => {
        // 2 diffs today, 1 diff yesterday
        const dates = [
            today,
            new Date(today.getTime() + 1000),
            daysAgo(1)
        ];
        const result = calculateStreak(dates);

        expect(result.streak).toBe(3); // 3 total diffs
        expect(result.activeDates).toContain(toIso(today));
        expect(result.activeDates).toContain(toIso(daysAgo(1)));
    });

    test("getStreakCalendar generates months with weeks", () => {
        // Mock a streak from 2 weeks ago to today
        const start = daysAgo(10);
        const active = [toIso(start), toIso(today)];

        const months = getStreakCalendar(start.toISOString(), active);

        // Should have at least 1 month (3 months total for 3-month window)
        expect(months.length).toBeGreaterThanOrEqual(1);

        // Verify structure
        const firstMonth = months[0];
        expect(firstMonth.monthLabel).toBeDefined();
        expect(firstMonth.weeks.length).toBeGreaterThanOrEqual(1);

        // Each week should have 7 days
        for (const week of firstMonth.weeks) {
            expect(week.length).toBe(7);
        }
    });
});
