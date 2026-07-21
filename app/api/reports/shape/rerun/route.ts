/**
 * Rerun a failed Shape report job by run_id or cadence+force.
 *
 * POST /api/reports/shape/rerun
 * Body: { runId?: string, cadence?: string, force?: boolean }
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
export const maxDuration = 300;

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

export async function POST(request: Request) {
  const denied = await authorize(request);
  if (denied) return denied;

  let body: { runId?: string; cadence?: ShapeReportCadence; force?: boolean } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();

  if (body.runId) {
    const { data: run, error } = await admin
      .from("shape_report_runs")
      .select("cadence,run_id,status")
      .eq("run_id", body.runId)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!run) return NextResponse.json({ error: "Run not found" }, { status: 404 });

    const result = await deliverShapeReport(admin, {
      cadence: run.cadence as ShapeReportCadence,
      force: true,
      runId: run.run_id as string,
    });

    return NextResponse.json({ ok: result.status === "sent", ...result });
  }

  if (body.cadence) {
    const result = await deliverShapeReport(admin, {
      cadence: body.cadence,
      force: body.force ?? true,
    });
    return NextResponse.json({ ok: result.status === "sent", ...result });
  }

  return NextResponse.json({ error: "Provide runId or cadence" }, { status: 400 });
}
