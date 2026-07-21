import { describe, expect, it } from "vitest";

import { extractLeadNote, stripHtmlTags } from "./note-extraction";

describe("stripHtmlTags", () => {
  it("removes html tags", () => {
    expect(stripHtmlTags("<p>Hello <strong>world</strong></p>")).toBe("Hello world");
  });
});

describe("extractLeadNote", () => {
  it("prefers ai note over sidebar", () => {
    const note = extractLeadNote({
      notesSidebarAi: "<p>AI summary of call</p>",
      notesSidebar: "Old sidebar text here for testing purposes",
      statusRaw: "New Lead",
    });
    expect(note.snippet).toContain("AI summary");
    expect(note.source).toBe("ai_note");
  });

  it("flags empty notes", () => {
    const note = extractLeadNote({});
    expect(note.flags).toContain("empty");
    expect(note.snippet).toBeNull();
  });

  it("flags conflicting status vs note", () => {
    const note = extractLeadNote({
      recentNotes: "Please follow up tomorrow — borrower interested",
      statusRaw: "Funded",
    });
    expect(note.flags).toContain("conflicting_status");
  });
});
