import { afterEach, describe, expect, it, vi } from "vitest";

import { buildAiNoteComments, type AiNoteCommentLead } from "./ai-note-comment";

function lead(overrides: Partial<AiNoteCommentLead> = {}): AiNoteCommentLead {
  return {
    loanId: "shape-1",
    borrowerName: "Jane Borrower",
    source: "Inbound Zoom",
    loName: "Sam LO",
    status: "New Lead",
    noteRaw: { sidebar: null, aiNote: null, recent: null, gamePlan: null },
    noteQualityFlags: [],
    ...overrides,
  };
}

describe("buildAiNoteComments", () => {
  const originalKey = process.env.OPENAI_API_KEY;

  afterEach(() => {
    process.env.OPENAI_API_KEY = originalKey;
    vi.restoreAllMocks();
  });

  it("returns an empty map for no leads", async () => {
    const result = await buildAiNoteComments([]);
    expect(result.size).toBe(0);
  });

  it("falls back to a template comment when OpenAI is not configured", async () => {
    delete process.env.OPENAI_API_KEY;
    const l = lead({ noteRaw: { sidebar: null, aiNote: "Borrower is ready to lock rate.", recent: null, gamePlan: null } });
    const result = await buildAiNoteComments([l]);
    expect(result.get(l.loanId)).toContain("ready to lock rate");
    expect(result.get(l.loanId)).toContain("LO: Sam LO");
  });

  it("template fallback plainly states when no notes exist", async () => {
    delete process.env.OPENAI_API_KEY;
    const l = lead();
    const result = await buildAiNoteComments([l]);
    expect(result.get(l.loanId)).toMatch(/no usable notes/i);
  });

  it("falls back to template if the OpenAI call fails", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));
    const l = lead({ noteRaw: { sidebar: null, aiNote: "Wants to refinance soon.", recent: null, gamePlan: null } });
    const result = await buildAiNoteComments([l]);
    expect(result.get(l.loanId)).toContain("Wants to refinance soon");
  });

  it("uses the LLM comment when the call succeeds", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({ comments: { "shape-1": "Engaged borrower, ready for next step." } }),
            },
          },
        ],
      }),
    } as Response);

    const l = lead({ noteRaw: { sidebar: null, aiNote: "raw note text", recent: null, gamePlan: null } });
    const result = await buildAiNoteComments([l]);
    expect(result.get(l.loanId)).toBe("Engaged borrower, ready for next step.");
  });
});
