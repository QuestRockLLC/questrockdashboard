/** Parsed LendingPad Critical Dates used for dashboard milestone labels. */
export type LpCriticalDates = {
  applicationTakenAt: string | null;
  leIssuedAt: string | null;
  intentToProceedAt: string | null;
  lpProcessingAt: string | null;
  estimatedClosingAt: string | null;
};

export const LP_CRITICAL_DATE_COLUMNS = [
  "application_taken_at",
  "le_issued_at",
  "intent_to_proceed_at",
  "lp_processing_at",
] as const;

export type LpCriticalDateColumn = (typeof LP_CRITICAL_DATE_COLUMNS)[number];

export function parseIsoLpDate(value: unknown): string | null {
  if (value == null || value === "") return null;
  const s = String(value).trim();
  // LP often returns "yyyy-MM-dd" or "yyyy-MM-ddTHH:mm:ss" without a TZ suffix.
  // Anchor date-only values at noon UTC so dashboard labels stay on the correct calendar day.
  const dateOnly = s.match(/^(\d{4}-\d{2}-\d{2})$/);
  if (dateOnly) {
    const d = new Date(`${dateOnly[1]}T12:00:00.000Z`);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const datePrefix = s.match(/^(\d{4}-\d{2}-\d{2})T/);
  if (datePrefix) {
    const d = new Date(`${datePrefix[1]}T12:00:00.000Z`);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function lpDateOnly(value: unknown): string | null {
  if (value == null || value === "") return null;
  const m = String(value).trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

const EMPTY_CRITICAL_DATES: LpCriticalDates = {
  applicationTakenAt: null,
  leIssuedAt: null,
  intentToProceedAt: null,
  lpProcessingAt: null,
  estimatedClosingAt: null,
};

/**
 * Extract QuestRock disclosure-pipeline dates from an LP export webhook `dates`
 * object (or any object with the same camelCase keys).
 */
export function lpCriticalDatesFromRecord(
  dates: Record<string, unknown> | null | undefined,
): LpCriticalDates {
  if (!dates) return { ...EMPTY_CRITICAL_DATES };

  return {
    applicationTakenAt: parseIsoLpDate(dates.applicationTaken),
    // LE Issued populates when predisclosure is sent for eSign
    leIssuedAt:
      parseIsoLpDate(dates.loanEstimate) ??
      parseIsoLpDate(dates.loanEstimateIssued),
    intentToProceedAt: parseIsoLpDate(dates.intentToProceed ?? dates.IntentToProceed),
    // Processor manually sets Processing date → dashboard Validation
    lpProcessingAt: parseIsoLpDate(dates.processing),
    estimatedClosingAt:
      parseIsoLpDate(dates.estimatedClosing) ??
      parseIsoLpDate(dates.closingEstimate),
  };
}

export function lpCriticalDatesToLoanColumns(
  dates: LpCriticalDates,
): Partial<Record<LpCriticalDateColumn, string>> {
  const out: Partial<Record<LpCriticalDateColumn, string>> = {};
  if (dates.applicationTakenAt) out.application_taken_at = dates.applicationTakenAt;
  if (dates.leIssuedAt) out.le_issued_at = dates.leIssuedAt;
  if (dates.intentToProceedAt) out.intent_to_proceed_at = dates.intentToProceedAt;
  if (dates.lpProcessingAt) out.lp_processing_at = dates.lpProcessingAt;
  return out;
}

type RowWithCriticalDates = {
  application_taken_at?: string | null;
  le_issued_at?: string | null;
  intent_to_proceed_at?: string | null;
  lp_processing_at?: string | null;
  closing_date?: string | null;
};

/** Fill missing critical-date columns from LP export raw JSON already stored in rich_loan_data. */
export function hydrateLpCriticalDatesFromRawJson(
  row: RowWithCriticalDates,
  lpRawJson: unknown,
): void {
  if (!lpRawJson || typeof lpRawJson !== "object") return;
  const raw = lpRawJson as Record<string, unknown>;
  const datesObj =
    raw.dates && typeof raw.dates === "object"
      ? (raw.dates as Record<string, unknown>)
      : raw;
  const parsed = lpCriticalDatesFromRecord(datesObj);

  if (!row.application_taken_at && parsed.applicationTakenAt) {
    row.application_taken_at = parsed.applicationTakenAt;
  }
  if (!row.le_issued_at && parsed.leIssuedAt) {
    row.le_issued_at = parsed.leIssuedAt;
  }
  if (!row.intent_to_proceed_at && parsed.intentToProceedAt) {
    row.intent_to_proceed_at = parsed.intentToProceedAt;
  }
  if (!row.lp_processing_at && parsed.lpProcessingAt) {
    row.lp_processing_at = parsed.lpProcessingAt;
  }
  if (!row.closing_date) {
    const closing =
      lpDateOnly(datesObj.estimatedClosing) ??
      lpDateOnly(datesObj.closingEstimate) ??
      (parsed.estimatedClosingAt ? parsed.estimatedClosingAt.slice(0, 10) : null);
    if (closing) row.closing_date = closing;
  }
}
