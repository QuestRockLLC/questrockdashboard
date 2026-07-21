import { etMidnightIso, etTodayDate } from "@/lib/date-utils";
import type { ShapeReportCadence, ShapeReportPeriod } from "./types";

function etDateParts(now: Date): { year: number; month: number; day: number; weekday: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
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
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    weekday: weekdayMap[get("weekday")] ?? now.getDay(),
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

  // monthly
  const { year, month } = etDateParts(now);
  const monthStartEt = `${year}-${String(month).padStart(2, "0")}-01`;
  const periodStart = etMidnightForDate(monthStartEt);
  return {
    cadence,
    periodStart,
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

export function shouldRunCadenceToday(cadence: ShapeReportCadence, now: Date = new Date()): boolean {
  const { weekday, day } = etDateParts(now);
  if (cadence === "morning_lo") return weekday >= 1 && weekday <= 5;
  if (cadence === "daily") return true;
  if (cadence === "weekly") return weekday === 1;
  if (cadence === "monthly") return day === 1;
  return false;
}
