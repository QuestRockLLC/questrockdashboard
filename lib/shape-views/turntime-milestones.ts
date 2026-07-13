export type TurntimePhaseKey =
  | "verification"
  | "packageOut"
  | "validation"
  | "underwriting"
  | "ctc";

export type MilestoneProgressState = "complete" | "in-progress" | "stalled" | "open";

export type TurntimeMilestone = {
  key: TurntimePhaseKey;
  title: string;
  detail: string;
  time: string;
  /** SLA ceiling in hours for active milestone alerts. */
  slaHours: number;
};

export const TURNTIME_MILESTONES: readonly TurntimeMilestone[] = [
  {
    key: "verification",
    title: "Verification",
    detail: "Bank Statement, Full Doc, DSCR — track A or B applies internally",
    time: "2 hours – 5 days",
    slaHours: 120,
  },
  {
    key: "packageOut",
    title: "Package Out",
    detail: "In-house or brokered disclosure package",
    time: "30 minutes – 24 hours",
    slaHours: 24,
  },
  {
    key: "validation",
    title: "Validation",
    detail: "File validation",
    time: "48 hours",
    slaHours: 48,
  },
  {
    key: "underwriting",
    title: "Underwriting",
    detail: "Credit decision",
    time: "Up to 72 hours",
    slaHours: 72,
  },
  {
    key: "ctc",
    title: "CTC",
    detail: "Must be CTC 24 hours before closing",
    time: "24 hours",
    slaHours: 24,
  },
] as const;

export const NEUTRAL_MILESTONE_PROGRESS: Record<TurntimePhaseKey, MilestoneProgressState> = {
  verification: "open",
  packageOut: "open",
  validation: "open",
  underwriting: "open",
  ctc: "open",
};

/** @deprecated Track is kept for internal SLA logic only; UI shows a single Verification milestone. */
export function milestonesForVerificationTrack(
  _verificationTrack?: "Verification A" | "Verification B" | "All" | "Pending",
): TurntimeMilestone[] {
  return [...TURNTIME_MILESTONES];
}

export function phaseLabel(phaseKey: TurntimePhaseKey | "all"): string {
  if (phaseKey === "all") return "All phases";
  return TURNTIME_MILESTONES.find((step) => step.key === phaseKey)?.title ?? "All phases";
}
