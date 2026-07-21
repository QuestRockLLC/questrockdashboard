import { etMidnightIso, etTodayDate } from "@/lib/date-utils";
import type { ShapeReportCadence, ShapeReportPeriod } from "./types";

function etDateParts(now: Date): {
  year: number;
  month: number;
  day: number;
  weekday: number;
  hour: number;
  minute: number;
} {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  // hour12:false can render midnight as "24" in some Intl implementations.
  const rawHour = Number(get("hour"));
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    weekday: weekdayMap[get("weekday")] ?? now.getDay(),
    hour: rawHour === 24 ? 0 : rawHour,
    minute: Number(get("minute")),
  };
}

function etMidnightForDate(dateStr: string): string {
  return etMidnightIso(new Date(`${dateStr}T12:00:00.000Z`));
}

function addDaysEt(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatLabel(date: Date, style: "day" | "week" | "month"): string {
  if (style === "day") {
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "America/New_York",
    });
  }
  if (style === "month") {
    return date.toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "America/New_York",
    });
  }
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  });
}

export function getShapeReportPeriod(
  cadence: ShapeReportCadence,
  now: Date = new Date(),
): ShapeReportPeriod {
  const todayEt = etTodayDate(now);

  if (cadence === "morning_lo") {
    const periodStart = etMidnightIso(now);
    const periodEnd = now.toISOString();
    return {
      cadence,
      periodStart,
      periodEnd,
      label: `Morning digest · ${formatLabel(now, "day")}`,
    };
  }

  if (cadence === "daily") {
    const periodStart = etMidnightIso(now);
    return {
      cadence,
      periodStart,
      periodEnd: now.toISOString(),
      label: formatLabel(now, "day"),
    };
  }

  if (cadence === "weekly") {
    const { weekday } = etDateParts(now);
    const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
    const mondayEt = addDaysEt(todayEt, mondayOffset);
    const periodStart = etMidnightForDate(mondayEt);
    return {
      cadence,
      periodStart,
      periodEnd: now.toISOString(),
      label: `Week of ${formatLabel(new Date(`${mondayEt}T12:00:00.000Z`), "week")}`,
    };
  }

  // monthly — scheduled send happens on the 1st (7am ET), which should
  // report the just-completed prior month in full, not a near-empty
  // "month-to-date" for the day that just started. Ad-hoc/force runs on any
  // other day still get the current month-to-date snapshot.
  const { year, month, day } = etDateParts(now);
  const currentMonthStartEt = `${year}-${String(month).padStart(2, "0")}-01`;

  if (day === 1) {
    const priorMonth = month === 1 ? 12 : month - 1;
    const priorYear = month === 1 ? year - 1 : year;
    const priorMonthStartEt = `${priorYear}-${String(priorMonth).padStart(2, "0")}-01`;
    return {
      cadence,
      periodStart: etMidnightForDate(priorMonthStartEt),
      periodEnd: etMidnightForDate(currentMonthStartEt),
      label: formatLabel(new Date(`${priorMonthStartEt}T12:00:00.000Z`), "month"),
    };
  }

  return {
    cadence,
    periodStart: etMidnightForDate(currentMonthStartEt),
    periodEnd: now.toISOString(),
    label: formatLabel(now, "month"),
  };
}

/** Previous period for week-over-week / month-over-month deltas. */
export function getPreviousShapeReportPeriod(
  cadence: ShapeReportCadence,
  current: ShapeReportPeriod,
): ShapeReportPeriod | null {
  if (cadence === "morning_lo" || cadence === "daily") return null;

  const start = new Date(current.periodStart);
  const end = new Date(current.periodEnd);
  const durationMs = end.getTime() - start.getTime();

  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - durationMs);

  return {
    cadence,
    periodStart: prevStart.toISOString(),
    periodEnd: prevEnd.toISOString(),
    label: `Previous ${cadence}`,
  };
}

/** Target Eastern-Time send hour (24h) for each timed cadence. */
export const SHAPE_REPORT_SEND_HOUR_ET: Record<"daily" | "weekly" | "monthly", number> = {
  daily: 17, // 5:00 PM ET
  weekly: 7, // 7:00 AM ET, Sundays
  monthly: 7, // 7:00 AM ET, 1st of month
};

/**
 * True once per day when `cadence` is due, gated to its target ET hour so
 * cron invocations outside that hour (e.g. the once-daily nightly cron)
 * don't fire it early/late. `minute < 15` limits it to the first tick of
 * the hour when called from a 15-minute cron — harmless if called more
 * often since delivery is idempotent per period.
 */
export function shouldRunCadenceToday(cadence: ShapeReportCadence, now: Date = new Date()): boolean {
  const { weekday, day, hour, minute } = etDateParts(now);
  if (cadence === "morning_lo") return weekday >= 1 && weekday <= 5;
  if (cadence === "daily") return hour === SHAPE_REPORT_SEND_HOUR_ET.daily && minute < 15;
  if (cadence === "weekly")
    return weekday === 0 && hour === SHAPE_REPORT_SEND_HOUR_ET.weekly && minute < 15;
  if (cadence === "monthly")
    return day === 1 && hour === SHAPE_REPORT_SEND_HOUR_ET.monthly && minute < 15;
  return false;
}
