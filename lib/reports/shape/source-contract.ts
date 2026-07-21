/**
 * Canonical Shape lead-source contract for email reporting.
 *
 * Shape exports vary by report — this module normalizes raw `source` and
 * `channel` values into exactly four tracked segments plus an "Other" bucket.
 */

export const CANONICAL_SHAPE_SOURCES = [
  "DSCR HOT",
  "WebLead",
  "Inbound Zoom",
  "Inbound Shape",
] as const;

export type CanonicalShapeSource = (typeof CANONICAL_SHAPE_SOURCES)[number];

export type ShapeLeadSourceFields = {
  source?: string | null;
  channel?: string | null;
  utmCampaign?: string | null;
};

/** Exact-match aliases (case-insensitive, whitespace-normalized). */
const EXACT_SOURCE_ALIASES: Record<string, CanonicalShapeSource> = {
  "dscr hot": "DSCR HOT",
  "dscr-hot": "DSCR HOT",
  "dscrhot": "DSCR HOT",
  "hot dscr": "DSCR HOT",
  weblead: "WebLead",
  "web lead": "WebLead",
  "web-lead": "WebLead",
  "web leads": "WebLead",
  "inbound zoom": "Inbound Zoom",
  "zoom inbound": "Inbound Zoom",
  "inbound zoom call": "Inbound Zoom",
  // Live Shape data records this source as the bare word "Zoom" — this is the
  // single largest tracked source and must not fall through to "Other".
  zoom: "Inbound Zoom",
  "zoom call": "Inbound Zoom",
  "inbound shape": "Inbound Shape",
  "shape inbound": "Inbound Shape",
  "inbound shape lead": "Inbound Shape",
  "inbound shape call": "Inbound Shape",
};

/** Fuzzy patterns when exact match fails. Order matters — first match wins. */
const FUZZY_SOURCE_PATTERNS: Array<{ canonical: CanonicalShapeSource; pattern: RegExp }> = [
  { canonical: "DSCR HOT", pattern: /dscr.*hot|hot.*dscr/i },
  { canonical: "WebLead", pattern: /web\s*lead|weblead/i },
  { canonical: "Inbound Zoom", pattern: /inbound.*zoom|zoom.*inbound|\bzoom\b/i },
  { canonical: "Inbound Shape", pattern: /inbound.*shape|shape.*inbound/i },
];

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Normalize a raw Shape source/channel string to a canonical segment.
 * Returns null when the value is empty.
 */
export function normalizeShapeSource(raw: string | null | undefined): CanonicalShapeSource | null {
  if (!raw?.trim()) return null;
  const key = normalizeKey(raw);
  if (EXACT_SOURCE_ALIASES[key]) return EXACT_SOURCE_ALIASES[key];
  for (const { canonical, pattern } of FUZZY_SOURCE_PATTERNS) {
    if (pattern.test(raw)) return canonical;
  }
  return null;
}

/**
 * Resolve the canonical source for a lead row, checking source then channel.
 */
export function resolveCanonicalShapeSource(
  fields: ShapeLeadSourceFields,
): CanonicalShapeSource | "Other" {
  const candidates = [fields.source, fields.channel, fields.utmCampaign].filter(Boolean) as string[];
  for (const raw of candidates) {
    const canonical = normalizeShapeSource(raw);
    if (canonical) return canonical;
  }
  return "Other";
}

export function emptySourceBreakdown(): Record<CanonicalShapeSource | "Other", number> {
  return {
    "DSCR HOT": 0,
    WebLead: 0,
    "Inbound Zoom": 0,
    "Inbound Shape": 0,
    Other: 0,
  };
}

export function incrementSourceBreakdown(
  breakdown: Record<CanonicalShapeSource | "Other", number>,
  source: CanonicalShapeSource | "Other",
): void {
  breakdown[source] = (breakdown[source] ?? 0) + 1;
}

/** Required Shape report export fields (contract for downstream builders). */
export const SHAPE_REPORT_LEAD_FIELDS = [
  "id",
  "shape_record_id",
  "borrower_first_name",
  "borrower_last_name",
  "source",
  "channel",
  "utm_campaign",
  "assigned_loan_officer_name",
  "status_raw",
  "lead_created_at",
  "shape_last_updated_at",
  "last_status_change_at",
  "notes_sidebar",
  "notes_sidebar_ai_note",
  "recent_notes",
  "record_type",
] as const;

export type ShapeReportLoanRow = {
  id: string;
  shape_record_id: number | null;
  borrower_first_name: string | null;
  borrower_last_name: string | null;
  source: string | null;
  channel: string | null;
  utm_campaign: string | null;
  assigned_loan_officer_name: string | null;
  status_raw: string | null;
  lead_created_at: string | null;
  shape_last_updated_at: string | null;
  last_status_change_at: string | null;
  notes_sidebar: string | null;
  notes_sidebar_ai_note: string | null;
  recent_notes: string | null;
  record_type: string | null;
};
