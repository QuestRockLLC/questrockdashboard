import { describe, expect, it } from "vitest";

import {
  normalizeShapeSource,
  resolveCanonicalShapeSource,
  emptySourceBreakdown,
  incrementSourceBreakdown,
} from "./source-contract";

describe("normalizeShapeSource", () => {
  it("maps exact canonical names", () => {
    expect(normalizeShapeSource("DSCR HOT")).toBe("DSCR HOT");
    expect(normalizeShapeSource("WebLead")).toBe("WebLead");
    expect(normalizeShapeSource("Inbound Zoom")).toBe("Inbound Zoom");
    expect(normalizeShapeSource("Inbound Shape")).toBe("Inbound Shape");
  });

  it("maps common aliases", () => {
    expect(normalizeShapeSource("dscr-hot")).toBe("DSCR HOT");
    expect(normalizeShapeSource("web lead")).toBe("WebLead");
    expect(normalizeShapeSource("Zoom Inbound")).toBe("Inbound Zoom");
    expect(normalizeShapeSource("shape inbound lead")).toBe("Inbound Shape");
  });

  it("returns null for unknown sources", () => {
    expect(normalizeShapeSource("Referral")).toBeNull();
    expect(normalizeShapeSource("")).toBeNull();
  });
});

describe("resolveCanonicalShapeSource", () => {
  it("checks source then channel", () => {
    expect(resolveCanonicalShapeSource({ source: "Referral", channel: "WebLead" })).toBe("WebLead");
    expect(resolveCanonicalShapeSource({ source: "DSCR HOT" })).toBe("DSCR HOT");
    expect(resolveCanonicalShapeSource({ source: "Unknown" })).toBe("Other");
  });
});

describe("source breakdown helpers", () => {
  it("increments counts", () => {
    const b = emptySourceBreakdown();
    incrementSourceBreakdown(b, "DSCR HOT");
    incrementSourceBreakdown(b, "DSCR HOT");
    expect(b["DSCR HOT"]).toBe(2);
  });
});
