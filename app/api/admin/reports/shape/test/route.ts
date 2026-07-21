import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/lib/current-user";
import { canAccessAdmin } from "@/lib/permissions";
import { deliverShapeReport } from "@/lib/reports/shape/deliver";
import type { ShapeReportCadence } from "@/lib/reports/shape/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TEST_CADENCES: ShapeReportCadence[] = ["daily", "weekly", "monthly"];

export async function POST(request: Request) {
  try {
    const { appUser } = await requireCurrentUser();
    if (!canAccessAdmin(appUser.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let cadence: ShapeReportCadence;
  try {
    const body = (await request.json()) as { cadence?: ShapeReportCadence };
    cadence = body.cadence as ShapeReportCadence;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!TEST_CADENCES.includes(cadence)) {
    return NextResponse.json(
      { error: "Invalid cadence. Use daily, weekly, or monthly." },
      { status: 400 },
    );
  }

  try {
    const admin = createSupabaseAdminClient();
    const result = await deliverShapeReport(admin, {
      cadence,
      force: true,
    });

    return NextResponse.json(
      {
        ok: result.status === "sent",
        ...result,
      },
      { status: result.status === "failed" ? 502 : 200 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[admin/reports/shape/test] failed:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
