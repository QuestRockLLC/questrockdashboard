import { describe, expect, it } from "vitest";

import { getShapeReportPeriod, shouldRunCadenceToday } from "./period-utils";

/** Build a UTC Date for a given ET wall-clock moment (EDT = UTC-4 in summer). */
function etDate(y: number, m: number, d: number, hEt: number, minEt = 0): Date {
  return new Date(Date.UTC(y, m - 1, d, hEt + 4, minEt));
}

describe("shouldRunCadenceToday", () => {
  it("gates daily to 5pm ET only", () => {
    expect(shouldRunCadenceToday("daily", etDate(2026, 7, 21, 17, 0))).toBe(true);
    expect(shouldRunCadenceToday("daily", etDate(2026, 7, 21, 17, 14))).toBe(true);
    expect(shouldRunCadenceToday("daily", etDate(2026, 7, 21, 17, 15))).toBe(false);
    expect(shouldRunCadenceToday("daily", etDate(2026, 7, 21, 9, 0))).toBe(false);
  });

  it("gates weekly to Sunday 7am ET only", () => {
    // 2026-07-19 is a Sunday.
    expect(shouldRunCadenceToday("weekly", etDate(2026, 7, 19, 7, 0))).toBe(true);
    expect(shouldRunCadenceToday("weekly", etDate(2026, 7, 19, 8, 0))).toBe(false);
    expect(shouldRunCadenceToday("weekly", etDate(2026, 7, 20, 7, 0))).toBe(false); // Monday
  });

  it("gates monthly to the 1st at 7am ET only", () => {
    expect(shouldRunCadenceToday("monthly", etDate(2026, 8, 1, 7, 0))).toBe(true);
    expect(shouldRunCadenceToday("monthly", etDate(2026, 8, 1, 8, 0))).toBe(false);
    expect(shouldRunCadenceToday("monthly", etDate(2026, 8, 2, 7, 0))).toBe(false);
  });

  it("keeps morning_lo gated to weekdays regardless of hour", () => {
    expect(shouldRunCadenceToday("morning_lo", etDate(2026, 7, 20, 9, 0))).toBe(true); // Monday
    expect(shouldRunCadenceToday("morning_lo", etDate(2026, 7, 19, 9, 0))).toBe(false); // Sunday
  });
});

describe("getShapeReportPeriod monthly rollover", () => {
  it("reports the full prior month when generated on the 1st", () => {
    const period = getShapeReportPeriod("monthly", etDate(2026, 8, 1, 7, 0));
    expect(period.periodStart.slice(0, 10)).toBe("2026-07-01");
    expect(period.periodEnd.slice(0, 10)).toBe("2026-08-01");
    expect(period.label).toContain("July");
  });

  it("rolls over the year when the prior month is December", () => {
    const period = getShapeReportPeriod("monthly", etDate(2027, 1, 1, 7, 0));
    expect(period.label).toContain("December 2026");
  });

  it("falls back to month-to-date for ad-hoc runs later in the month", () => {
    const period = getShapeReportPeriod("monthly", etDate(2026, 8, 15, 12, 0));
    expect(period.periodStart.slice(0, 10)).toBe("2026-08-01");
    expect(period.label).toContain("August");
  });
});
