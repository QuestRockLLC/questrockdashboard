import { stripHtmlTags } from "./note-extraction";
import type { ShapeReportLead } from "./types";

export type AiNoteCommentLead = Pick<
  ShapeReportLead,
  "loanId" | "borrowerName" | "source" | "loName" | "status" | "noteRaw" | "noteQualityFlags"
>;

const MAX_COMMENT_LEN = 170;
const MAX_BATCH = 25;

function clean(raw: string | null): string | null {
  if (!raw?.trim()) return null;
  const plain = stripHtmlTags(raw);
  return plain.length > 4 ? plain : null;
}

function trim(text: string, maxLen = MAX_COMMENT_LEN): string {
  return text.length > maxLen ? `${text.slice(0, maxLen - 1)}…` : text;
}

/** Rule-based fallback used when OpenAI is unavailable or a call fails. */
function templateComment(lead: AiNoteCommentLead): string {
  const best = clean(lead.noteRaw.aiNote) ?? clean(lead.noteRaw.recent) ?? clean(lead.noteRaw.sidebar) ?? clean(lead.noteRaw.gamePlan);
  const loPart = lead.loName ? ` LO: ${lead.loName}.` : " Unassigned.";
  if (!best) {
    return trim(`No usable notes on file for this ${lead.source} lead.${loPart} Status: ${lead.status ?? "Unknown"}.`);
  }
  return trim(`${best}${loPart}`);
}

/**
 * Synthesizes a one-line "AI note comment" per lead from all available note
 * sources (Shape's own AI note, recent/call notes, sidebar notes, game plan
 * notes) plus CRM fields (status, source, LO), rather than surfacing a raw
 * note verbatim. Falls back to a rule-based comment if OpenAI isn't
 * configured or the call fails, so the report never blocks on this step.
 */
export async function buildAiNoteComments(
  leads: AiNoteCommentLead[],
): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  if (leads.length === 0) return results;

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    for (const lead of leads) results.set(lead.loanId, templateComment(lead));
    return results;
  }

  const batch = leads.slice(0, MAX_BATCH);
  const prompt = batch.map((lead) => ({
    loanId: lead.loanId,
    borrower: lead.borrowerName,
    source: lead.source,
    loanOfficer: lead.loName ?? "Unassigned",
    status: lead.status ?? "Unknown",
    noteQualityFlags: lead.noteQualityFlags,
    notes: {
      shapeAiNote: clean(lead.noteRaw.aiNote),
      recentCallOrTranscriptNotes: clean(lead.noteRaw.recent),
      sidebarNotes: clean(lead.noteRaw.sidebar),
      gamePlanNotes: clean(lead.noteRaw.gamePlan),
    },
  }));

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
              "You are a mortgage-lending ops analyst writing internal report comments. For EACH lead in the input array, write ONE concise sentence (max 160 characters) that synthesizes its notes, call/transcript summaries, and CRM status/source into an actionable comment for management (e.g. engagement level, next step, risk). Base it strictly on the given fields — never invent facts not present in the input. If a lead has no usable note content (all note fields are null), say so plainly and reference its status/source instead (e.g. 'No notes on file yet; DSCR HOT lead, status New Lead.'). " +
              'Return strict JSON: { "comments": { "<loanId>": "<comment>", ... } } with exactly one entry per input lead, keyed by the given loanId.',
          },
          { role: "user", content: JSON.stringify(prompt) },
        ],
      }),
    });

    if (!res.ok) throw new Error(`OpenAI ${res.status}`);
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = json.choices?.[0]?.message?.content;
    if (!content) throw new Error("empty LLM response");
    const parsed = JSON.parse(content) as { comments?: Record<string, string> };

    for (const lead of batch) {
      const comment = parsed.comments?.[lead.loanId]?.trim();
      results.set(lead.loanId, comment ? trim(comment) : templateComment(lead));
    }
  } catch {
    for (const lead of batch) results.set(lead.loanId, templateComment(lead));
  }

  for (const lead of leads.slice(MAX_BATCH)) {
    results.set(lead.loanId, templateComment(lead));
  }

  return results;
}
