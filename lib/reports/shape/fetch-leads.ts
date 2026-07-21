import type { SupabaseClient } from "@supabase/supabase-js";

import { shapeBulkExport } from "@/lib/shape-api/client";
import { mapApiRecordToCsvLike } from "@/lib/shape-api/field-map";
import { getCanonicalLoName } from "@/lib/shape-api/lo-roster";
import type { ShapeBulkExportResponse } from "@/lib/shape-api/types";
import { parseMaybeTimestamp, type ShapeKpiCsvRow } from "@/lib/import/shape-kpi";

import {
  emptySourceBreakdown,
  incrementSourceBreakdown,
  resolveCanonicalShapeSource,
} from "./source-contract";
import { extractLeadNote } from "./note-extraction";
import type { ShapeReportCadence, ShapeReportLead, ShapeReportPeriod } from "./types";

const SHAPE_PAGE_SIZE = 50;
const DEFAULT_MAX_PAGES = 100;
const DEFAULT_PAGE_CONCURRENCY = 8;
const SHAPE_REPORT_EXPORT_FIELDS = [
  "leadid",
  "createdDate",
  "lastActivityDate",
  "firstname",
  "lastname",
  "depursLo",
  "Loan Officer User Name",
  "mstrstatus1",
  "Lead Status",
  "leadsource",
  "channel",
  "utmCampaign",
  "Last Status Change Date",
  "notes_sidebar",
  "notes_sidebar_ai_note",
  "recent_notes",
  "game_plan_notes",
] as const;

function stringValue(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

function parseShapeTimestamp(value: string | null | undefined): string | null {
  if (!value) return null;
  const mapped = parseMaybeTimestamp(value);
  if (mapped) return mapped;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function borrowerName(row: ShapeKpiCsvRow): string {
  return [row["First Name"], row["Last Name"]].filter(Boolean).join(" ").trim() || "Unknown";
}

export type FetchShapeLeadsResult = {
  leads: ShapeReportLead[];
  sourceBreakdown: ReturnType<typeof emptySourceBreakdown>;
  totalQueried: number;
  pagesFetched: number;
  sourceSystem: "shape_api";
};

function effectiveWindowStart(period: ShapeReportPeriod, cadence: ShapeReportCadence): string {
  if (cadence === "morning_lo") {
    return new Date(new Date(period.periodEnd).getTime() - 24 * 60 * 60 * 1000).toISOString();
  }
  return period.periodStart;
}

function isNoRecordsError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    (message.includes("Record") && message.includes("not found")) ||
    message.includes("400 Bad Request")
  );
}

function pageFingerprint(records: Record<string, unknown>[]): string {
  const ids = records.map((record) =>
    String(record["Lead ID"] ?? record.leadid ?? record.leadId ?? ""),
  );
  return `${records.length}|${ids.slice(0, 5).join(",")}|${ids.slice(-5).join(",")}`;
}

async function fetchLiveShapeRows(
  period: ShapeReportPeriod,
  cadence: ShapeReportCadence,
): Promise<{ rows: ShapeKpiCsvRow[]; pagesFetched: number }> {
  const from = effectiveWindowStart(period, cadence).slice(0, 10);
  const to = period.periodEnd.slice(0, 10);
  const maxPages = Math.max(
    1,
    Number(process.env.SHAPE_REPORT_MAX_PAGES ?? DEFAULT_MAX_PAGES),
  );
  const pageConcurrency = Math.min(
    12,
    Math.max(
      1,
      Number(process.env.SHAPE_REPORT_PAGE_CONCURRENCY ?? DEFAULT_PAGE_CONCURRENCY),
    ),
  );
  const rowsByLeadId = new Map<string, ShapeKpiCsvRow>();
  const seenFingerprints = new Set<string>();
  let pagesFetched = 0;
  let reachedEnd = false;

  for (
    let batchStart = 1;
    batchStart <= maxPages && !reachedEnd;
    batchStart += pageConcurrency
  ) {
    const pageNumbers = Array.from(
      { length: Math.min(pageConcurrency, maxPages - batchStart + 1) },
      (_, index) => batchStart + index,
    );

    const batch = await Promise.all(
      pageNumbers.map(async (pageNumber) => {
      const dateRange =
        cadence === "morning_lo"
          ? { updatedDateRange: { from, to } }
          : { createdDateRange: { from, to } };

        try {
          const response: ShapeBulkExportResponse = await shapeBulkExport({
            ...dateRange,
            fields: SHAPE_REPORT_EXPORT_FIELDS,
            pageNumber,
          });
          return {
            pageNumber,
            records: Object.values(response.data ?? {}) as Record<string, unknown>[],
          };
        } catch (error) {
          if (isNoRecordsError(error)) return { pageNumber, records: [] };
          throw error;
        }
      }),
    );

    for (const { pageNumber, records } of batch.sort((a, b) => a.pageNumber - b.pageNumber)) {
      if (reachedEnd) break;
      if (records.length === 0) {
        reachedEnd = true;
        break;
      }

      pagesFetched += 1;
      const fingerprint = pageFingerprint(records);
      if (seenFingerprints.has(fingerprint)) {
        reachedEnd = true;
        break;
      }
      seenFingerprints.add(fingerprint);

      for (const record of records) {
        const row = mapApiRecordToCsvLike(record);
        const leadId = String(row.recordId ?? row["Lead ID"] ?? "").trim();
        if (!leadId) continue;
        rowsByLeadId.set(leadId, row);
      }

      if (records.length < SHAPE_PAGE_SIZE) reachedEnd = true;
    }
  }

  if (!reachedEnd && pagesFetched >= maxPages) {
    throw new Error(
      `Shape report reached SHAPE_REPORT_MAX_PAGES (${maxPages}); refusing to send a partial report.`,
    );
  }

  return { rows: [...rowsByLeadId.values()], pagesFetched };
}

function isQuestMail(row: ShapeKpiCsvRow): boolean {
  return [row.Source, row.Channel, row["Custom Field - UTM Campaign"]]
    .filter(Boolean)
    .some((value) => /quest\s*mail/i.test(String(value)));
}

export async function fetchShapeReportLeads(
  _admin: SupabaseClient,
  period: ShapeReportPeriod,
  cadence: ShapeReportCadence,
): Promise<FetchShapeLeadsResult> {
  const { rows, pagesFetched } = await fetchLiveShapeRows(period, cadence);
  const sourceBreakdown = emptySourceBreakdown();
  const leads: ShapeReportLead[] = [];

  for (const row of rows) {
    if (isQuestMail(row)) continue;

    const source = resolveCanonicalShapeSource({
      source: row.Source,
      channel: row.Channel,
      utmCampaign: row["Custom Field - UTM Campaign"],
    });

    // Email reports intentionally contain only the four approved Shape sources.
    if (source === "Other") continue;
    incrementSourceBreakdown(sourceBreakdown, source);

    const leadId = String(row.recordId ?? row["Lead ID"] ?? "").trim();
    const createdAt = parseShapeTimestamp(row["Created Date"]) ?? period.periodStart;
    const updatedAt =
      parseShapeTimestamp(row["Date Loan Last Updated"]) ??
      parseShapeTimestamp(row["Last Status Change Date"]);
    const status = stringValue(row.Status);
    const rawLoName = stringValue(row["Loan Officer User Name"]);
    const loName = getCanonicalLoName(rawLoName) ?? rawLoName;

    const note = extractLeadNote({
      notesSidebar: row["Notes Sidebar"],
      notesSidebarAi: row["Notes Sidebar AI Note"],
      recentNotes: row["Recent Note"] ?? row["Game Plan Notes"],
      statusRaw: status,
      lastUpdatedAt: updatedAt,
    });

    leads.push({
      loanId: `shape-${leadId}`,
      shapeLeadId: Number(leadId) || null,
      borrowerName: borrowerName(row),
      source,
      sourceRaw: stringValue(row.Source),
      channel: stringValue(row.Channel),
      loName,
      status,
      createdAt,
      updatedAt,
      noteSnippet: note.snippet,
      noteSource: note.source,
      noteAt: note.noteAt,
      noteQualityFlags: note.flags,
    });
  }

  leads.sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt));
  return {
    leads,
    sourceBreakdown,
    totalQueried: rows.length,
    pagesFetched,
    sourceSystem: "shape_api",
  };
}
