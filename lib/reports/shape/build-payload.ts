import { randomUUID, createHash } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { buildAiNoteComments } from "./ai-note-comment";
import { buildShapeAiSummary } from "./ai-summary";
import { fetchShapeReportLeads } from "./fetch-leads";
import { getShapeReportPeriod } from "./period-utils";
import { renderShapeReportEmail } from "./render-email";
import type {
  ShapeLoBreakdownRow,
  ShapeNoteHighlight,
  ShapeReportCadence,
  ShapeReportPayload,
  ShapeStatusBreakdownRow,
} from "./types";

function buildLoBreakdown(leads: ShapeReportPayload["leads"]): ShapeLoBreakdownRow[] {
  const byLo = new Map<string, ShapeLoBreakdownRow>();

  for (const lead of leads) {
    const loName = lead.loName ?? "Unassigned";
    const row = byLo.get(loName) ?? {
      loName,
      total: 0,
      bySource: {},
      newLeads: 0,
      updatedLeads: 0,
    };
    row.total += 1;
    row.bySource[lead.source] = (row.bySource[lead.source] ?? 0) + 1;
    if (lead.createdAt >= (lead.updatedAt ?? lead.createdAt)) row.newLeads += 1;
    else row.updatedLeads += 1;
    byLo.set(loName, row);
  }

  return [...byLo.values()].sort((a, b) => b.total - a.total);
}

function buildStatusBreakdown(leads: ShapeReportPayload["leads"]): ShapeStatusBreakdownRow[] {
  const counts = new Map<string, number>();
  for (const lead of leads) {
    const status = lead.status?.trim() || "Unknown";
    counts.set(status, (counts.get(status) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count);
}

function buildNoteHighlights(leads: ShapeReportPayload["leads"]): ShapeNoteHighlight[] {
  return leads
    .filter((l) => l.noteSnippet)
    .slice(0, 20)
    .map((l) => ({
      loanId: l.loanId,
      shapeLeadId: l.shapeLeadId,
      borrowerName: l.borrowerName,
      loName: l.loName,
      source: l.source,
      snippet: l.noteSnippet!,
      aiComment: l.aiNoteComment ?? l.noteSnippet!,
      noteAt: l.noteAt,
      flags: l.noteQualityFlags,
    }));
}

/**
 * Synthesizes an "AI note comment" (notes + call/transcript summaries + CRM
 * status/source) for every lead that has a note, and mutates `lead.aiNoteComment`
 * in place so downstream consumers (aiSummary, note highlights) both use the
 * synthesized comment instead of a raw note quote.
 */
async function attachAiNoteComments(leads: ShapeReportPayload["leads"]): Promise<void> {
  const candidates = leads.filter((l) => l.noteSnippet).slice(0, 20);
  if (candidates.length === 0) return;

  const comments = await buildAiNoteComments(
    candidates.map((lead) => ({
      loanId: lead.loanId,
      borrowerName: lead.borrowerName,
      source: lead.source,
      loName: lead.loName,
      status: lead.status,
      noteRaw: lead.noteRaw,
      noteQualityFlags: lead.noteQualityFlags,
    })),
  );

  for (const lead of candidates) {
    const comment = comments.get(lead.loanId);
    if (comment) lead.aiNoteComment = comment;
  }
}

export async function buildShapeReportPayload(
  admin: SupabaseClient,
  cadence: ShapeReportCadence,
  options?: { runId?: string; now?: Date },
): Promise<ShapeReportPayload> {
  const now = options?.now ?? new Date();
  const period = getShapeReportPeriod(cadence, now);
  const runId = options?.runId ?? randomUUID();

  const liveShape = await fetchShapeReportLeads(admin, period, cadence);
  const { leads, sourceBreakdown } = liveShape;

  // Populate leads[].aiNoteComment before the AI summary and note-highlights
  // steps so both surface the synthesized comment instead of a raw note quote.
  await attachAiNoteComments(leads);

  const aiSummary = await buildShapeAiSummary({
    cadence,
    periodLabel: period.label,
    leads,
    sourceBreakdown,
    statusChanges: leads.filter((lead) => lead.updatedAt).length,
    notesAdded: leads.filter((lead) => lead.noteSnippet).length,
    previousSourceBreakdown: null,
  });

  const loBreakdown = buildLoBreakdown(leads);
  const statusBreakdown = buildStatusBreakdown(leads);
  const noteHighlights = buildNoteHighlights(leads);

  const base: Omit<ShapeReportPayload, "emailSubject" | "emailHtml" | "emailText"> = {
    reportType: cadence,
    cadence,
    sourceSystem: "shape_api",
    sourceFetchedAt: now.toISOString(),
    sourceRecordsQueried: liveShape.totalQueried,
    sourcePagesFetched: liveShape.pagesFetched,
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    periodLabel: period.label,
    recipientGroup: "pilot_nikk",
    recipients: [],
    leadCount: leads.length,
    sourceBreakdown,
    loBreakdown,
    statusBreakdown,
    noteHighlights,
    leads,
    aiSummary,
    runId,
    generatedAt: now.toISOString(),
  };

  const email = renderShapeReportEmail(base);
  return { ...base, ...email };
}

export function hashShapeReportPayload(payload: ShapeReportPayload): string {
  const stable = {
    cadence: payload.cadence,
    periodStart: payload.periodStart,
    periodEnd: payload.periodEnd,
    leadCount: payload.leadCount,
    sourceBreakdown: payload.sourceBreakdown,
    runId: payload.runId,
  };
  return createHash("sha256").update(JSON.stringify(stable)).digest("hex").slice(0, 32);
}
