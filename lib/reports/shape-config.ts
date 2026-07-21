/**
 * Pilot recipient configuration for Shape email reports.
 * Phase 2: expand to LO / manager / admin groups via env JSON.
 */

export type ShapeReportRecipient = {
  email: string;
  name: string;
  group: string;
};

export type ShapeReportRecipientGroup = "pilot_nikk" | "lo" | "manager" | "admin";

const DEFAULT_PILOT: ShapeReportRecipient = {
  email: "nikksmith@questrock.com",
  name: "Nikk Smith",
  group: "pilot_nikk",
};

export function getShapeReportRecipients(group: ShapeReportRecipientGroup = "pilot_nikk"): ShapeReportRecipient[] {
  if (group !== "pilot_nikk") {
    const json = process.env.SHAPE_REPORT_RECIPIENTS_JSON?.trim();
    if (json) {
      try {
        const parsed = JSON.parse(json) as ShapeReportRecipient[];
        return parsed.filter((r) => r.group === group && r.email);
      } catch {
        /* fall through */
      }
    }
    return [];
  }

  const email = process.env.SHAPE_REPORT_PILOT_EMAIL?.trim() || DEFAULT_PILOT.email;
  const name = process.env.SHAPE_REPORT_PILOT_NAME?.trim() || DEFAULT_PILOT.name;
  return [{ email, name, group: "pilot_nikk" }];
}

export function isShapeReportDeliveryEnabled(): boolean {
  return Boolean(process.env.ZAPIER_SHAPE_REPORT_WEBHOOK_URL?.trim());
}
