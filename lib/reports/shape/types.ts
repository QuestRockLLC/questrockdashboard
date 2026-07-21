import type { CanonicalShapeSource } from "./source-contract";

export type ShapeReportCadence = "morning_lo" | "daily" | "weekly" | "monthly";

export type ShapeReportType = ShapeReportCadence;

export type NoteQualityFlag = "empty" | "stale" | "junk" | "conflicting_status";

export type ShapeReportLead = {
  loanId: string;
  shapeLeadId: number | null;
  borrowerName: string;
  source: CanonicalShapeSource | "Other";
  sourceRaw: string | null;
  channel: string | null;
  loName: string | null;
  status: string | null;
  createdAt: string;
  updatedAt: string | null;
  noteSnippet: string | null;
  noteSource: "ai_note" | "recent" | "sidebar" | "loan_notes" | null;
  noteAt: string | null;
  noteQualityFlags: NoteQualityFlag[];
  /** Raw note text by source, kept separately so the AI comment step can
   * synthesize across all of them rather than just the single "best" one. */
  noteRaw: {
    sidebar: string | null;
    aiNote: string | null;
    recent: string | null;
    gamePlan: string | null;
  };
  /** AI-synthesized one-line comment (notes + status + source), populated in
   * build-payload.ts after the lead list is assembled. Null until then. */
  aiNoteComment: string | null;
};

export type ShapeReportPeriod = {
  cadence: ShapeReportCadence;
  periodStart: string;
  periodEnd: string;
  label: string;
};

export type ShapeSourceBreakdown = Record<CanonicalShapeSource | "Other", number>;

export type ShapeLoBreakdownRow = {
  loName: string;
  total: number;
  bySource: Partial<ShapeSourceBreakdown>;
  newLeads: number;
  updatedLeads: number;
};

export type ShapeStatusBreakdownRow = {
  status: string;
  count: number;
};

export type ShapeNoteHighlight = {
  loanId: string;
  shapeLeadId: number | null;
  borrowerName: string;
  loName: string | null;
  source: CanonicalShapeSource | "Other";
  /** Raw note text (kept for audit/evidence; no longer shown directly in the email). */
  snippet: string;
  /** AI-synthesized comment shown in the email — falls back to `snippet` if
   * AI generation is unavailable. */
  aiComment: string;
  noteAt: string | null;
  flags: NoteQualityFlag[];
};

export type ShapeAiSummary = {
  topOpportunities: string[];
  topRisks: string[];
  actionsByPriority: string[];
  sourceInsights: string[];
  evidence: Array<{
    loanId: string;
    shapeLeadId: number | null;
    noteAt: string | null;
    detail: string;
  }>;
  source: "template" | "llm";
};

export type ShapeReportPayload = {
  reportType: ShapeReportType;
  cadence: ShapeReportCadence;
  sourceSystem: "shape_api";
  sourceFetchedAt: string;
  sourceRecordsQueried: number;
  sourcePagesFetched: number;
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  recipientGroup: string;
  recipients: Array<{ email: string; name: string }>;
  leadCount: number;
  sourceBreakdown: ShapeSourceBreakdown;
  loBreakdown: ShapeLoBreakdownRow[];
  statusBreakdown: ShapeStatusBreakdownRow[];
  noteHighlights: ShapeNoteHighlight[];
  leads: ShapeReportLead[];
  aiSummary: ShapeAiSummary;
  runId: string;
  generatedAt: string;
  emailSubject: string;
  emailHtml: string;
  emailText: string;
};

export type ShapeReportDeliveryResult = {
  runId: string;
  cadence: ShapeReportCadence;
  status: "sent" | "failed" | "skipped";
  skippedReason?: string;
  leadCount: number;
  sourceRecordsQueried?: number;
  sourcePagesFetched?: number;
  zapierStatus?: number;
  error?: string;
};
