import type { ShapeReportPayload } from "@/lib/reports/shape/types";

/** Normalized payload posted to Zapier Catch Hook for email delivery. */
export type ZapierShapeReportPayload = {
  event: "shape_report.generated";
  reportType: ShapeReportPayload["reportType"];
  cadence: ShapeReportPayload["cadence"];
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  recipientGroup: string;
  recipients: Array<{ email: string; name: string }>;
  leadCount: number;
  sourceBreakdown: ShapeReportPayload["sourceBreakdown"];
  loBreakdown: ShapeReportPayload["loBreakdown"];
  statusBreakdown: ShapeReportPayload["statusBreakdown"];
  noteHighlights: ShapeReportPayload["noteHighlights"];
  aiSummary: ShapeReportPayload["aiSummary"];
  runId: string;
  generatedAt: string;
  emailSubject: string;
  emailHtml: string;
  emailText: string;
  /** Zapier Paths routing hint */
  zapierPath: ShapeReportPayload["cadence"];
};

export function toZapierShapeReportPayload(payload: ShapeReportPayload): ZapierShapeReportPayload {
  return {
    event: "shape_report.generated",
    reportType: payload.reportType,
    cadence: payload.cadence,
    periodStart: payload.periodStart,
    periodEnd: payload.periodEnd,
    periodLabel: payload.periodLabel,
    recipientGroup: payload.recipientGroup,
    recipients: payload.recipients,
    leadCount: payload.leadCount,
    sourceBreakdown: payload.sourceBreakdown,
    loBreakdown: payload.loBreakdown,
    statusBreakdown: payload.statusBreakdown,
    noteHighlights: payload.noteHighlights,
    aiSummary: payload.aiSummary,
    runId: payload.runId,
    generatedAt: payload.generatedAt,
    emailSubject: payload.emailSubject,
    emailHtml: payload.emailHtml,
    emailText: payload.emailText,
    zapierPath: payload.cadence,
  };
}
