import { describe, expect, it } from "vitest";

import {
  hydrateLpCriticalDatesFromRawJson,
  lpCriticalDatesFromRecord,
} from "./lp-critical-dates";

describe("lpCriticalDatesFromRecord", () => {
  it("maps LE Issued, Intent to Proceed, and Processing dates", () => {
    const parsed = lpCriticalDatesFromRecord({
      applicationTaken: "2026-07-21T00:00:00",
      loanEstimate: "2026-07-21T15:00:00",
      intentToProceed: null,
      processing: null,
      estimatedClosing: "2026-08-21T00:00:00",
    });

    expect(parsed.applicationTakenAt).toContain("2026-07-21");
    expect(parsed.leIssuedAt).toContain("2026-07-21");
    expect(parsed.intentToProceedAt).toBeNull();
    expect(parsed.estimatedClosingAt).toContain("2026-08-21");
  });
});

describe("hydrateLpCriticalDatesFromRawJson", () => {
  it("fills missing loan columns from export raw JSON", () => {
    const row: {
      le_issued_at: string | null;
      intent_to_proceed_at: string | null;
      closing_date: string | null;
    } = {
      le_issued_at: null,
      intent_to_proceed_at: null,
      closing_date: null,
    };

    hydrateLpCriticalDatesFromRawJson(row, {
      dates: {
        loanEstimate: "2026-07-21T15:00:00",
        intentToProceed: "2026-07-25T12:00:00",
        estimatedClosing: "2026-08-21T00:00:00",
      },
    });

    expect(row.le_issued_at).toContain("2026-07-21");
    expect(row.intent_to_proceed_at).toContain("2026-07-25");
    expect(row.closing_date).toBe("2026-08-21");
  });
});
