import type {
  ShapeAiSummary,
  ShapeReportCadence,
  ShapeReportLead,
  ShapeSourceBreakdown,
} from "./types";
import { CANONICAL_SHAPE_SOURCES } from "./source-contract";

export type AiSummaryInput = {
  cadence: ShapeReportCadence;
  periodLabel: string;
  leads: ShapeReportLead[];
  sourceBreakdown: ShapeSourceBreakdown;
  statusChanges?: number;
  notesAdded?: number;
  previousSourceBreakdown?: ShapeSourceBreakdown | null;
};

function topBySource(
  leads: ShapeReportLead[],
  source: ShapeReportLead["source"],
  limit = 3,
): ShapeReportLead[] {
  return leads.filter((l) => l.source === source && l.noteSnippet).slice(0, limit);
}

function buildTemplateSummary(input: AiSummaryInput): ShapeAiSummary {
  const { leads, sourceBreakdown, cadence, periodLabel } = input;
  const topOpportunities: string[] = [];
  const topRisks: string[] = [];
  const actionsByPriority: string[] = [];
  const sourceInsights: string[] = [];
  const evidence: ShapeAiSummary["evidence"] = [];

  const withNotes = leads.filter((l) => l.noteSnippet);
  const noNotes = leads.filter((l) => l.noteQualityFlags.includes("empty"));
  const staleNotes = leads.filter((l) => l.noteQualityFlags.includes("stale"));
  const conflicting = leads.filter((l) => l.noteQualityFlags.includes("conflicting_status"));
  const unassigned = leads.filter((l) => !l.loName);

  if (withNotes.length > 0) {
    const hot = withNotes.slice(0, 3);
    for (const l of hot) {
      topOpportunities.push(
        `${l.borrowerName} (${l.source}) — ${l.noteSnippet}${l.loName ? ` · LO: ${l.loName}` : ""}`,
      );
      evidence.push({
        loanId: l.loanId,
        shapeLeadId: l.shapeLeadId,
        noteAt: l.noteAt,
        detail: l.noteSnippet ?? "",
      });
    }
  }

  if (noNotes.length > 0) {
    topRisks.push(`${noNotes.length} lead${noNotes.length === 1 ? "" : "s"} have no usable notes — follow-up context missing.`);
  }
  if (staleNotes.length > 0) {
    topRisks.push(`${staleNotes.length} lead${staleNotes.length === 1 ? "" : "s"} have stale notes (>7 days).`);
  }
  if (conflicting.length > 0) {
    topRisks.push(`${conflicting.length} lead${conflicting.length === 1 ? "" : "s"} show status vs note mismatch — review before outreach.`);
  }
  if (unassigned.length > 0) {
    topRisks.push(`${unassigned.length} unassigned lead${unassigned.length === 1 ? "" : "s"} in window.`);
  }

  for (const source of CANONICAL_SHAPE_SOURCES) {
    const count = sourceBreakdown[source];
    if (count === 0) continue;
    const prev = input.previousSourceBreakdown?.[source] ?? 0;
    const delta = prev > 0 ? count - prev : null;
    const deltaStr = delta == null ? "" : delta >= 0 ? ` (+${delta} vs prior)` : ` (${delta} vs prior)`;
    sourceInsights.push(`${source}: ${count} lead${count === 1 ? "" : "s"}${deltaStr}`);
    const samples = topBySource(leads, source, 1);
    if (samples[0]?.noteSnippet) {
      sourceInsights.push(`  ↳ ${samples[0].borrowerName}: "${samples[0].noteSnippet}"`);
    }
  }

  if (cadence === "morning_lo") {
    actionsByPriority.push("Review new/updated leads from last 24h and assign any unowned records.");
    actionsByPriority.push("Prioritize DSCR HOT and WebLead rows with fresh notes for same-day contact.");
  } else if (cadence === "daily") {
    actionsByPriority.push("Clear red-flag leads (no notes, stale notes, status conflicts) before EOD.");
    if (input.statusChanges) {
      actionsByPriority.push(`Review ${input.statusChanges} status change${input.statusChanges === 1 ? "" : "s"} logged today.`);
    }
  } else if (cadence === "weekly") {
    actionsByPriority.push("Compare source mix week-over-week and reallocate LO coverage where volume spiked.");
    actionsByPriority.push("Audit leads with empty notes — add context or disposition.");
  } else {
    actionsByPriority.push("Review monthly source conversion patterns and blockers surfaced in notes.");
    actionsByPriority.push("Identify LOs with high volume but low note quality for coaching.");
  }

  if (leads.length === 0) {
    topOpportunities.push(`No leads matched the ${periodLabel} window for tracked Shape sources.`);
  }

  return {
    topOpportunities: topOpportunities.slice(0, 5),
    topRisks: topRisks.slice(0, 5),
    actionsByPriority: actionsByPriority.slice(0, 5),
    sourceInsights: sourceInsights.slice(0, 8),
    evidence: evidence.slice(0, 10),
    source: "template",
  };
}

async function buildLlmSummary(input: AiSummaryInput, template: ShapeAiSummary): Promise<ShapeAiSummary> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return template;

  const prompt = {
    cadence: input.cadence,
    periodLabel: input.periodLabel,
    leadCount: input.leads.length,
    sourceBreakdown: input.sourceBreakdown,
    noteHighlights: input.leads
      .filter((l) => l.noteSnippet)
      .slice(0, 15)
      .map((l) => ({
        borrower: l.borrowerName,
        source: l.source,
        lo: l.loName,
        status: l.status,
        note: l.noteSnippet,
        flags: l.noteQualityFlags,
      })),
    templateSummary: {
      topOpportunities: template.topOpportunities,
      topRisks: template.topRisks,
      actionsByPriority: template.actionsByPriority,
      sourceInsights: template.sourceInsights,
    },
  };

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You refine lead report summaries for QuestRock ops. Return JSON with keys: topOpportunities, topRisks, actionsByPriority, sourceInsights (each string array, max 5 items). Be concise, actionable, cite lead sources. Do not invent leads not in the input.",
          },
          { role: "user", content: JSON.stringify(prompt) },
        ],
      }),
    });

    if (!res.ok) return template;
    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.message?.content;
    if (!content) return template;

    const parsed = JSON.parse(content) as Partial<ShapeAiSummary>;
    return {
      topOpportunities: parsed.topOpportunities?.slice(0, 5) ?? template.topOpportunities,
      topRisks: parsed.topRisks?.slice(0, 5) ?? template.topRisks,
      actionsByPriority: parsed.actionsByPriority?.slice(0, 5) ?? template.actionsByPriority,
      sourceInsights: parsed.sourceInsights?.slice(0, 8) ?? template.sourceInsights,
      evidence: template.evidence,
      source: "llm",
    };
  } catch {
    return template;
  }
}

export async function buildShapeAiSummary(input: AiSummaryInput): Promise<ShapeAiSummary> {
  const template = buildTemplateSummary(input);
  if (process.env.SHAPE_REPORT_AI_MODE === "llm") {
    return buildLlmSummary(input, template);
  }
  return template;
}
