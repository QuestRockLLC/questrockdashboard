import type { NoteQualityFlag } from "./types";

export type ExtractedNote = {
  snippet: string | null;
  source: "ai_note" | "recent" | "sidebar" | "loan_notes" | null;
  noteAt: string | null;
  flags: NoteQualityFlag[];
};

export type NoteInput = {
  notesSidebar?: string | null;
  notesSidebarAi?: string | null;
  recentNotes?: string | null;
  loanNoteBodies?: Array<{ body: string; notedAt: string | null }>;
  statusRaw?: string | null;
  lastUpdatedAt?: string | null;
};

const STALE_NOTE_DAYS = 7;

export function stripHtmlTags(raw: string): string {
  return raw
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/p>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function isJunkNote(text: string): boolean {
  if (/post_method\s*:/i.test(text)) return true;
  if (/sourcehdn\s*:/i.test(text)) return true;
  if (/crmrefld\s*:/i.test(text)) return true;
  if (/leadtype\s*:/i.test(text)) return true;
  if (/pageurl\s*:/i.test(text)) return true;
  if (/shapeportal/i.test(text)) return true;
  if (/date:\s*\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/i.test(text)) return true;
  if (/investment_property\s*:/i.test(text)) return true;
  if (/loan_type\s*:/i.test(text)) return true;
  if (/property_picked\s*:/i.test(text)) return true;
  return false;
}

function trimSnippet(plain: string, maxLen = 160): string {
  const sentences = plain.match(/[^.!?\n]+[.!?]*/g) ?? [];
  const two = sentences.slice(0, 2).join(" ").trim();
  const result = two.length > 8 ? two : plain.trim();
  return result.length > maxLen ? `${result.slice(0, maxLen - 1)}…` : result;
}

function isStale(noteAt: string | null, lastUpdatedAt: string | null): boolean {
  const ref = noteAt ?? lastUpdatedAt;
  if (!ref) return false;
  const ageMs = Date.now() - new Date(ref).getTime();
  return ageMs > STALE_NOTE_DAYS * 24 * 60 * 60 * 1000;
}

function statusConflictsWithNote(statusRaw: string | null, noteText: string): boolean {
  if (!statusRaw || !noteText) return false;
  const status = statusRaw.toLowerCase();
  const note = noteText.toLowerCase();
  const closedHints = ["funded", "closed", "withdrawn", "dead", "do not contact"];
  const activeHints = ["follow up", "call back", "waiting", "pending", "hot lead", "interested"];
  const statusClosed = closedHints.some((h) => status.includes(h));
  const noteActive = activeHints.some((h) => note.includes(h));
  return statusClosed && noteActive;
}

function pickCandidate(
  raw: string | null | undefined,
  source: ExtractedNote["source"],
  noteAt: string | null,
): { plain: string; source: ExtractedNote["source"]; noteAt: string | null } | null {
  if (!raw?.trim()) return null;
  const plain = stripHtmlTags(raw);
  if (plain.length <= 8 || isJunkNote(plain)) return null;
  return { plain, source, noteAt };
}

/**
 * Extract the best note snippet and quality flags for a lead.
 */
export function extractLeadNote(input: NoteInput): ExtractedNote {
  const flags: NoteQualityFlag[] = [];

  const candidates = [
    pickCandidate(input.notesSidebarAi, "ai_note", input.lastUpdatedAt ?? null),
    pickCandidate(input.recentNotes, "recent", input.lastUpdatedAt ?? null),
    pickCandidate(input.notesSidebar, "sidebar", input.lastUpdatedAt ?? null),
  ].filter(Boolean) as Array<{ plain: string; source: ExtractedNote["source"]; noteAt: string | null }>;

  if (input.loanNoteBodies?.length) {
    const sorted = [...input.loanNoteBodies].sort((a, b) =>
      (b.notedAt ?? "").localeCompare(a.notedAt ?? ""),
    );
    for (const n of sorted) {
      const c = pickCandidate(n.body, "loan_notes", n.notedAt);
      if (c) candidates.push(c);
    }
  }

  if (candidates.length === 0) {
    flags.push("empty");
    return { snippet: null, source: null, noteAt: null, flags };
  }

  const best = candidates[0];
  if (isJunkNote(best.plain)) flags.push("junk");
  if (isStale(best.noteAt, input.lastUpdatedAt ?? null)) flags.push("stale");
  if (statusConflictsWithNote(input.statusRaw ?? null, best.plain)) flags.push("conflicting_status");

  return {
    snippet: trimSnippet(best.plain),
    source: best.source,
    noteAt: best.noteAt,
    flags,
  };
}
