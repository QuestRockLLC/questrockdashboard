import { describe, expect, it, afterEach } from "vitest";
import {
  getCanonicalLoName,
  loNameFilterVariants,
  loNamesMatch,
  parseShapeDepursLoId,
  resolveDepursLoEmailToName,
  resolveDepursLoIdToName,
  resolveNameToDepursLoId,
  resetShapeLoRosterCacheForTests,
} from "./lo-roster";

afterEach(() => {
  delete process.env.SHAPE_LO_ROSTER_JSON;
  resetShapeLoRosterCacheForTests();
});

describe("lo-roster", () => {
  it("maps depursLo id to display name", () => {
    expect(resolveDepursLoIdToName(34)).toBe("Tyler Johnson");
    expect(resolveDepursLoIdToName(58)).toBe("Gregory Bethea Jr");
  });

  it("rejects loan amounts mistaken for depursLo ids", () => {
    expect(parseShapeDepursLoId("295000")).toBeNull();
    expect(parseShapeDepursLoId("34")).toBe(34);
  });

  it("maps display name to depursLo id", () => {
    expect(resolveNameToDepursLoId("Tyler Johnson")).toBe(34);
    expect(resolveNameToDepursLoId("Gregory Bethea Jr")).toBe(58);
  });

  it("maps depursLo email to display name", () => {
    expect(resolveDepursLoEmailToName("tjohnson@questrock.com")).toBe("Tyler Johnson");
    expect(resolveDepursLoEmailToName("nikksmith@questrock.com")).toBe("Nikk Smith");
  });

  it("maps Zack Davis aliases to Zachary Davis (depursLo 55)", () => {
    expect(resolveDepursLoIdToName(55)).toBe("Zachary Davis");
    expect(resolveDepursLoEmailToName("zdavis@questrock.com")).toBe("Zachary Davis");
    expect(resolveNameToDepursLoId("Zack Davis")).toBe(55);
    expect(getCanonicalLoName("Zack Davis")).toBe("Zachary Davis");
    expect(loNamesMatch("Zack Davis", "Zachary Davis")).toBe(true);
    expect(loNameFilterVariants("Zachary Davis")).toContain("Zack Davis");
  });
});
