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
  if (items.length === 0) {
    return `<p style="margin:0;color:#64748b;font-size:14px">No items identified.</p>`;
  }
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${items
    .map(
      (item) => `<tr>
        <td width="20" valign="top" style="padding:0 0 10px;color:#65a30d;font-size:16px">●</td>
        <td style="padding:0 0 10px;color:#334155;font-size:14px;line-height:21px">${esc(item)}</td>
      </tr>`,
    )
    .join("")}</table>`;
}

export function renderShapeReportEmail(
  payload: Omit<ShapeReportPayload, "emailSubject" | "emailHtml" | "emailText">,
): { emailSubject: string; emailHtml: string; emailText: string } {
  const subject = cadenceEmailSubject(payload.cadence, payload.periodLabel);
  const trackedSourceCount = CANONICAL_SHAPE_SOURCES.reduce(
    (total, source) => total + (payload.sourceBreakdown[source] ?? 0),
    0,
  );
  const assignedCount = payload.leads.filter((lead) => lead.loName).length;
  const withNotesCount = payload.leads.filter((lead) => lead.noteSnippet).length;
  const topSource = [...CANONICAL_SHAPE_SOURCES, "Other" as const]
    .map((source) => ({ source, count: payload.sourceBreakdown[source] ?? 0 }))
    .sort((a, b) => b.count - a.count)[0];
  const topStatus = payload.statusBreakdown[0];

  const sourceRows = [...CANONICAL_SHAPE_SOURCES, "Other" as const]
    .map(
      (s) =>
        `<tr>
          <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#334155;font-size:13px">${esc(s)}</td>
          <td align="right" style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#0f172a;font-size:13px;font-weight:700">${payload.sourceBreakdown[s] ?? 0}</td>
        </tr>`,
    )
    .join("");

  const loRows = payload.loBreakdown
    .slice(0, 10)
    .map(
      (r) =>
        `<tr>
          <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#334155;font-size:13px">${esc(r.loName)}</td>
          <td align="right" style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;font-weight:700">${r.total}</td>
          <td align="right" style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:13px">${r.newLeads}</td>
          <td align="right" style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:13px">${r.updatedLeads}</td>
        </tr>`,
    )
    .join("");

  const statusRows = payload.statusBreakdown
    .slice(0, 10)
    .map(
      (row) =>
        `<tr>
          <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#334155;font-size:13px">${esc(row.status)}</td>
          <td align="right" style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#0f172a;font-size:13px;font-weight:700">${row.count}</td>
        </tr>`,
    )
    .join("");

  const noteRows = payload.noteHighlights
    .slice(0, 10)
    .map(
      (n) =>
        `<tr>
          <td style="padding:12px;border-bottom:1px solid #e2e8f0;color:#0f172a;font-size:13px;font-weight:700">${esc(n.borrowerName)}</td>
          <td style="padding:12px;border-bottom:1px solid #e2e8f0;color:#475569;font-size:12px">${esc(n.source)}</td>
          <td style="padding:12px;border-bottom:1px solid #e2e8f0;color:#475569;font-size:12px">${esc(n.loName ?? "Unassigned")}</td>
          <td style="padding:12px;border-bottom:1px solid #e2e8f0;color:#475569;font-size:13px;line-height:19px">
            ${esc(n.aiComment)}
            ${
              n.flags.length
                ? `<div style="margin-top:5px;color:#b45309;font-size:10px;text-transform:uppercase;letter-spacing:.5px">${esc(n.flags.join(" · ").replaceAll("_", " "))}</div>`
                : ""
            }
          </td>
        </tr>`,
    )
    .join("");

  const html = `<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
  <title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9">
    <tr>
      <td align="center" style="padding:28px 12px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:760px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgba(15,23,42,.08)">
          <tr>
            <td style="padding:28px 32px;background:#12365a;border-bottom:5px solid #78a22f">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <div style="font-size:24px;font-weight:800;color:#ffffff;letter-spacing:-.5px">
                      <span style="color:#8fbd3e">◆</span> QuestRock
                    </div>
                    <div style="margin-top:6px;color:#cbd5e1;font-size:12px;text-transform:uppercase;letter-spacing:1.4px">
                      Shape Lead Intelligence
                    </div>
                  </td>
                  <td align="right" valign="top">
                    <span style="display:inline-block;padding:7px 11px;border-radius:999px;background:#ffffff1a;color:#ffffff;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px">
                      ${esc(payload.cadence.replace("_", " "))}
                    </span>
                  </td>
                </tr>
              </table>
              <h1 style="margin:26px 0 6px;color:#ffffff;font-size:27px;line-height:34px">${esc(CADENCE_TITLES[payload.cadence])}</h1>
              <p style="margin:0;color:#dbeafe;font-size:14px">${esc(payload.periodLabel)}</p>
              <p style="margin:10px 0 0;color:#bbf7d0;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.7px">
                Live Shape API · ${payload.sourceRecordsQueried} records checked · ${payload.sourcePagesFetched} page${payload.sourcePagesFetched === 1 ? "" : "s"}
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:26px 32px 12px">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="25%" style="padding:0 6px 12px 0">
                    <div style="padding:16px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc">
                      <div style="font-size:25px;font-weight:800;color:#12365a">${payload.leadCount}</div>
                      <div style="margin-top:4px;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.7px">Leads</div>
                    </div>
                  </td>
                  <td width="25%" style="padding:0 6px 12px">
                    <div style="padding:16px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc">
                      <div style="font-size:25px;font-weight:800;color:#12365a">${trackedSourceCount}</div>
                      <div style="margin-top:4px;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.7px">Tracked sources</div>
                    </div>
                  </td>
                  <td width="25%" style="padding:0 6px 12px">
                    <div style="padding:16px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc">
                      <div style="font-size:25px;font-weight:800;color:#12365a">${assignedCount}</div>
                      <div style="margin-top:4px;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.7px">Assigned</div>
                    </div>
                  </td>
                  <td width="25%" style="padding:0 0 12px 6px">
                    <div style="padding:16px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc">
                      <div style="font-size:25px;font-weight:800;color:#12365a">${withNotesCount}</div>
                      <div style="margin-top:4px;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.7px">With notes</div>
                    </div>
                  </td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:4px">
                <tr>
                  <td style="padding:13px 15px;border-radius:10px;background:#eff6ff;color:#1e3a5f;font-size:13px">
                    <strong>Leading source:</strong> ${esc(topSource?.source ?? "—")} (${topSource?.count ?? 0})
                    &nbsp;&nbsp;•&nbsp;&nbsp;
                    <strong>Top status:</strong> ${esc(topStatus?.status ?? "—")} (${topStatus?.count ?? 0})
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:14px 32px">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="50%" valign="top" style="padding:0 8px 0 0">
                    <div style="padding:20px;border:1px solid #dbeafe;border-radius:12px;background:#f8fbff">
                      <h2 style="margin:0 0 14px;color:#12365a;font-size:16px">Top opportunities</h2>
                      ${renderList(payload.aiSummary.topOpportunities)}
                    </div>
                  </td>
                  <td width="50%" valign="top" style="padding:0 0 0 8px">
                    <div style="padding:20px;border:1px solid #fee2e2;border-radius:12px;background:#fffafa">
                      <h2 style="margin:0 0 14px;color:#991b1b;font-size:16px">Risks requiring attention</h2>
                      ${renderList(payload.aiSummary.topRisks)}
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:14px 32px">
              <div style="padding:21px;border-radius:12px;background:#f7fee7;border:1px solid #d9f99d">
                <h2 style="margin:0 0 14px;color:#365314;font-size:16px">Recommended actions</h2>
                ${renderList(payload.aiSummary.actionsByPriority)}
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding:14px 32px">
              <div style="padding:21px;border-radius:12px;background:#fafafa;border:1px solid #e2e8f0">
                <h2 style="margin:0 0 14px;color:#12365a;font-size:16px">Source intelligence</h2>
                ${renderList(payload.aiSummary.sourceInsights)}
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding:14px 32px">
              <h2 style="margin:0 0 12px;color:#12365a;font-size:18px">Lead source overview</h2>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:10px;border-collapse:separate;overflow:hidden">
                <tr style="background:#f8fafc">
                  <th align="left" style="padding:11px 12px;color:#475569;font-size:11px;text-transform:uppercase;letter-spacing:.7px">Source</th>
                  <th align="right" style="padding:11px 12px;color:#475569;font-size:11px;text-transform:uppercase;letter-spacing:.7px">Leads</th>
                </tr>
                ${sourceRows}
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:14px 32px">
              <h2 style="margin:0 0 12px;color:#12365a;font-size:18px">Loan officer activity</h2>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:10px;border-collapse:separate;overflow:hidden">
                <tr style="background:#f8fafc">
                  <th align="left" style="padding:11px 12px;color:#475569;font-size:11px;text-transform:uppercase;letter-spacing:.7px">Loan officer</th>
                  <th align="right" style="padding:11px 12px;color:#475569;font-size:11px;text-transform:uppercase;letter-spacing:.7px">Total</th>
                  <th align="right" style="padding:11px 12px;color:#475569;font-size:11px;text-transform:uppercase;letter-spacing:.7px">New</th>
                  <th align="right" style="padding:11px 12px;color:#475569;font-size:11px;text-transform:uppercase;letter-spacing:.7px">Updated</th>
                </tr>
                ${loRows || `<tr><td colspan="4" style="padding:18px;color:#64748b;font-size:13px">No LO activity in this period.</td></tr>`}
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:14px 32px">
              <h2 style="margin:0 0 12px;color:#12365a;font-size:18px">Lead status distribution</h2>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:10px;border-collapse:separate;overflow:hidden">
                <tr style="background:#f8fafc">
                  <th align="left" style="padding:11px 12px;color:#475569;font-size:11px;text-transform:uppercase;letter-spacing:.7px">Status</th>
                  <th align="right" style="padding:11px 12px;color:#475569;font-size:11px;text-transform:uppercase;letter-spacing:.7px">Leads</th>
                </tr>
                ${statusRows || `<tr><td colspan="2" style="padding:18px;color:#64748b;font-size:13px">No lead statuses in this period.</td></tr>`}
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:14px 32px 30px">
              <h2 style="margin:0 0 12px;color:#12365a;font-size:18px">Latest note highlights</h2>
              <p style="margin:0 0 10px;color:#64748b;font-size:12px">AI-synthesized from Shape notes, call/transcript summaries, and CRM status — not a raw note dump.</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:10px;border-collapse:separate;overflow:hidden">
                <tr style="background:#f8fafc">
                  <th align="left" style="padding:11px 12px;color:#475569;font-size:11px">BORROWER</th>
                  <th align="left" style="padding:11px 12px;color:#475569;font-size:11px">SOURCE</th>
                  <th align="left" style="padding:11px 12px;color:#475569;font-size:11px">LO</th>
                  <th align="left" style="padding:11px 12px;color:#475569;font-size:11px">AI NOTE COMMENT</th>
                </tr>
                ${noteRows || `<tr><td colspan="4" style="padding:18px;color:#64748b;font-size:13px">No usable notes in this reporting period.</td></tr>`}
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0">
              <p style="margin:0;color:#64748b;font-size:11px;line-height:18px">
                QuestRock internal reporting · Generated ${esc(new Date(payload.generatedAt).toLocaleString("en-US", { timeZone: "America/New_York" }))} ET
                <br>Run ID: ${esc(payload.runId)}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const textLines: string[] = [
    subject,
    `${payload.leadCount} leads · ${payload.periodLabel}`,
    `Source: Live Shape API · ${payload.sourceRecordsQueried} records checked · ${payload.sourcePagesFetched} pages`,
    "",
    "SOURCE BREAKDOWN",
    ...CANONICAL_SHAPE_SOURCES.map((s) => `  ${s}: ${payload.sourceBreakdown[s] ?? 0}`),
    `  Other: ${payload.sourceBreakdown.Other ?? 0}`,
    "",
    "STATUS BREAKDOWN",
    ...payload.statusBreakdown.map((row) => `  ${row.status}: ${row.count}`),
    "",
    "LO BREAKDOWN",
    ...payload.loBreakdown.map(
      (row) => `  ${row.loName}: ${row.total} total · ${row.newLeads} new · ${row.updatedLeads} updated`,
    ),
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
    "NOTE HIGHLIGHTS (AI-synthesized)",
    ...payload.noteHighlights.map(
      (note) =>
        `  • ${note.borrowerName} · ${note.source} · ${note.loName ?? "Unassigned"}: ${note.aiComment}`,
    ),
    "",
    `Run ID: ${payload.runId}`,
  ];

  return { emailSubject: subject, emailHtml: html, emailText: textLines.join("\n") };
}
