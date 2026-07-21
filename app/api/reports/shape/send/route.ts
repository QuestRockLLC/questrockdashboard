/**
 * Manual trigger + rerun for Shape-sourced email reports (Zapier delivery).
 *
 * GET/POST /api/reports/shape/send?cadence=morning_lo|daily|weekly|monthly&force=1&dryRun=1
 *
 * Auth: CRON_SECRET, x-cron-secret, or executive/admin session.
 */
import { NextResponse } from "next/server";

import { isCronRequestAuthorized } from "@/lib/cron-auth";
import { requireCurrentUser } from "@/lib/current-user";
import { canViewExecutiveDashboard } from "@/lib/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { deliverShapeReport } from "@/lib/reports/shape/deliver";
import type { ShapeReportCadence } from "@/lib/reports/shape/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_CADENCES: ShapeReportCadence[] = ["morning_lo", "daily", "weekly", "monthly"];

async function authorize(request: Request): Promise<NextResponse | null> {
  if (isCronRequestAuthorized(request)) return null;
  try {
    const { appUser } = await requireCurrentUser();
    if (canViewExecutiveDashboard(appUser.role)) return null;
  } catch {
    /* fall through */
  }
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

async function handle(request: Request) {
  const denied = await authorize(request);
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const cadence = (searchParams.get("cadence") ?? "daily") as ShapeReportCadence;
  const force = searchParams.get("force") === "1" || searchParams.get("force") === "true";
  const dryRun = searchParams.get("dryRun") === "1" || searchParams.get("dryRun") === "true";
  const runId = searchParams.get("runId") ?? undefined;

  if (!VALID_CADENCES.includes(cadence)) {
    return NextResponse.json(
      { error: "Invalid cadence. Use morning_lo, daily, weekly, or monthly." },
      { status: 400 },
    );
  }

  try {
    const admin = createSupabaseAdminClient();
    const result = await deliverShapeReport(admin, { cadence, force, dryRun, runId });

    return NextResponse.json({
      ok: result.status === "sent" || result.status === "skipped",
      ...result,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[reports/shape/send] failed:", err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
