import { CANONICAL_SHAPE_SOURCES } from "./source-contract";
import type { ShapeReportPayload } from "./types";

const CADENCE_TITLES: Record<ShapeReportPayload["cadence"], string> = {
  morning_lo: "Morning LO Digest",
  daily: "Daily Lead Report",
  weekly: "Weekly Lead Report",
  monthly: "Monthly Lead Report",
};

export function cadenceEmailSubject(cadence: ShapeReportPayload["cadence"], periodLabel: string): string {
  return `${CADENCE_TITLES[cadence]} — ${periodLabel}`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderList(items: string[]): string {
  if (items.length === 0) return "<p><em>None</em></p>";
  return `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;
}

export function renderShapeReportEmail(
  payload: Omit<ShapeReportPayload, "emailSubject" | "emailHtml" | "emailText">,
): { emailSubject: string; emailHtml: string; emailText: string } {
  const subject = cadenceEmailSubject(payload.cadence, payload.periodLabel);

  const sourceRows = [...CANONICAL_SHAPE_SOURCES, "Other" as const]
    .map(
      (s) =>
        `<tr><td>${esc(s)}</td><td style="text-align:right">${payload.sourceBreakdown[s] ?? 0}</td></tr>`,
    )
    .join("");

  const loRows = payload.loBreakdown
    .slice(0, 10)
    .map(
      (r) =>
        `<tr><td>${esc(r.loName)}</td><td style="text-align:right">${r.total}</td><td style="text-align:right">${r.newLeads}</td><td style="text-align:right">${r.updatedLeads}</td></tr>`,
    )
    .join("");

  const noteRows = payload.noteHighlights
    .slice(0, 10)
    .map(
      (n) =>
        `<tr><td>${esc(n.borrowerName)}</td><td>${esc(n.source)}</td><td>${esc(n.loName ?? "—")}</td><td>${esc(n.snippet)}</td></tr>`,
    )
    .join("");

  const html = `<!DOCTYPE html>
<html><body style="font-family:Arial,sans-serif;color:#1a1a1a;max-width:720px">
<h2 style="color:#1e4d8c">${esc(subject)}</h2>
<p><strong>${payload.leadCount}</strong> leads · ${esc(payload.periodLabel)}</p>

<h3>Source breakdown</h3>
<table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;width:100%">
<tr><th align="left">Source</th><th align="right">Count</th></tr>
${sourceRows}
</table>

<h3>LO breakdown</h3>
<table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;width:100%">
<tr><th align="left">LO</th><th align="right">Total</th><th align="right">New</th><th align="right">Updated</th></tr>
${loRows || `<tr><td colspan="4"><em>No LO activity</em></td></tr>`}
</table>

<h3>AI — Top opportunities</h3>
${renderList(payload.aiSummary.topOpportunities)}

<h3>AI — Top risks</h3>
${renderList(payload.aiSummary.topRisks)}

<h3>Today's actions</h3>
${renderList(payload.aiSummary.actionsByPriority)}

<h3>Source insights</h3>
${renderList(payload.aiSummary.sourceInsights)}

<h3>Note highlights</h3>
<table cellpadding="6" cellspacing="0" border="1" style="border-collapse:collapse;width:100%;font-size:13px">
<tr><th>Borrower</th><th>Source</th><th>LO</th><th>Note</th></tr>
${noteRows || `<tr><td colspan="4"><em>No notes</em></td></tr>`}
</table>

<p style="color:#666;font-size:12px;margin-top:24px">Run ID: ${esc(payload.runId)} · Generated ${esc(payload.generatedAt)}</p>
</body></html>`;

  const textLines: string[] = [
    subject,
    `${payload.leadCount} leads · ${payload.periodLabel}`,
    "",
    "SOURCE BREAKDOWN",
    ...CANONICAL_SHAPE_SOURCES.map((s) => `  ${s}: ${payload.sourceBreakdown[s] ?? 0}`),
    `  Other: ${payload.sourceBreakdown.Other ?? 0}`,
    "",
    "TOP OPPORTUNITIES",
    ...payload.aiSummary.topOpportunities.map((o) => `  • ${o}`),
    "",
    "TOP RISKS",
    ...payload.aiSummary.topRisks.map((r) => `  • ${r}`),
    "",
    "ACTIONS",
    ...payload.aiSummary.actionsByPriority.map((a) => `  • ${a}`),
    "",
    "SOURCE INSIGHTS",
    ...payload.aiSummary.sourceInsights.map((s) => `  • ${s}`),
    "",
    `Run ID: ${payload.runId}`,
  ];

  return { emailSubject: subject, emailHtml: html, emailText: textLines.join("\n") };
}
