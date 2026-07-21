import type { SupabaseClient } from "@supabase/supabase-js";

import {
  emptySourceBreakdown,
  incrementSourceBreakdown,
  resolveCanonicalShapeSource,
  SHAPE_REPORT_LEAD_FIELDS,
  type ShapeReportLoanRow,
} from "./source-contract";
import { extractLeadNote } from "./note-extraction";
import type { ShapeReportCadence, ShapeReportLead, ShapeReportPeriod } from "./types";

const LOAN_SELECT = SHAPE_REPORT_LEAD_FIELDS.join(",");

function borrowerName(row: ShapeReportLoanRow): string {
  return [row.borrower_first_name, row.borrower_last_name].filter(Boolean).join(" ") || "Unknown";
}

function isLeadRecord(row: ShapeReportLoanRow): boolean {
  const rt = (row.record_type ?? "").toLowerCase();
  return !rt || rt.includes("lead");
}

function leadMatchesPeriod(row: ShapeReportLoanRow, period: ShapeReportPeriod, cadence: ShapeReportCadence): boolean {
  const windowStart = effectiveWindowStart(period, cadence);
  const windowEnd = period.periodEnd;

  const inWindow = (iso: string | null) => {
    if (!iso) return false;
    const t = new Date(iso).getTime();
    return t >= new Date(windowStart).getTime() && t <= new Date(windowEnd).getTime();
  };

  const createdInWindow = inWindow(row.lead_created_at);
  const updatedInWindow = inWindow(row.shape_last_updated_at);
  const statusChangedInWindow = inWindow(row.last_status_change_at);

  return createdInWindow || updatedInWindow || statusChangedInWindow;
}

export type FetchShapeLeadsResult = {
  leads: ShapeReportLead[];
  sourceBreakdown: ReturnType<typeof emptySourceBreakdown>;
  totalQueried: number;
};

function effectiveWindowStart(period: ShapeReportPeriod, cadence: ShapeReportCadence): string {
  if (cadence === "morning_lo") {
    return new Date(new Date(period.periodEnd).getTime() - 24 * 60 * 60 * 1000).toISOString();
  }
  return period.periodStart;
}

export async function fetchShapeReportLeads(
  admin: SupabaseClient,
  period: ShapeReportPeriod,
  cadence: ShapeReportCadence,
): Promise<FetchShapeLeadsResult> {
  const windowStart = effectiveWindowStart(period, cadence);
  const lookbackStart = new Date(new Date(windowStart).getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await admin
    .from("loans")
    .select(LOAN_SELECT)
    .or(
      `lead_created_at.gte.${lookbackStart},shape_last_updated_at.gte.${lookbackStart},last_status_change_at.gte.${lookbackStart}`,
    )
    .order("lead_created_at", { ascending: false })
    .limit(2000);

  if (error) throw error;

  const rows = (data ?? []) as unknown as ShapeReportLoanRow[];
  const filtered = rows.filter((r) => isLeadRecord(r) && leadMatchesPeriod(r, period, cadence));

  const loanIds = filtered.map((r) => r.id);
  const loanNotesByLoan = new Map<string, Array<{ body: string; notedAt: string | null }>>();

  if (loanIds.length > 0) {
    const { data: noteRows } = await admin
      .from("loan_notes")
      .select("loan_id,body,noted_at")
      .in("loan_id", loanIds.slice(0, 500))
      .gte("noted_at", lookbackStart)
      .order("noted_at", { ascending: false })
      .limit(1000);

    for (const n of noteRows ?? []) {
      const loanId = n.loan_id as string;
      const list = loanNotesByLoan.get(loanId) ?? [];
      list.push({ body: String(n.body ?? ""), notedAt: (n.noted_at as string | null) ?? null });
      loanNotesByLoan.set(loanId, list);
    }
  }

  const sourceBreakdown = emptySourceBreakdown();
  const leads: ShapeReportLead[] = filtered.map((row) => {
    const source = resolveCanonicalShapeSource({
      source: row.source,
      channel: row.channel,
      utmCampaign: row.utm_campaign,
    });
    incrementSourceBreakdown(sourceBreakdown, source);

    const note = extractLeadNote({
      notesSidebar: row.notes_sidebar,
      notesSidebarAi: row.notes_sidebar_ai_note,
      recentNotes: row.recent_notes,
      loanNoteBodies: loanNotesByLoan.get(row.id),
      statusRaw: row.status_raw,
      lastUpdatedAt: row.shape_last_updated_at ?? row.last_status_change_at,
    });

    return {
      loanId: row.id,
      shapeLeadId: row.shape_record_id,
      borrowerName: borrowerName(row),
      source,
      sourceRaw: row.source,
      channel: row.channel,
      loName: row.assigned_loan_officer_name,
      status: row.status_raw,
      createdAt: row.lead_created_at ?? period.periodStart,
      updatedAt: row.shape_last_updated_at ?? row.last_status_change_at,
      noteSnippet: note.snippet,
      noteSource: note.source,
      noteAt: note.noteAt,
      noteQualityFlags: note.flags,
    };
  });

  return { leads, sourceBreakdown, totalQueried: rows.length };
}

export async function fetchShapeActivityCounts(
  admin: SupabaseClient,
  period: ShapeReportPeriod,
): Promise<{ statusChanges: number; notesAdded: number }> {
  const { data, error } = await admin
    .from("shape_activity_log")
    .select("change_type")
    .gte("synced_at", period.periodStart)
    .lte("synced_at", period.periodEnd);

  if (error) return { statusChanges: 0, notesAdded: 0 };

  const rows = data ?? [];
  return {
    statusChanges: rows.filter((r) => r.change_type === "status_changed").length,
    notesAdded: rows.filter((r) => r.change_type === "note_added").length,
  };
}
