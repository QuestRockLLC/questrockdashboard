/**
 * 15-minute cron — Shape incremental sync ONLY.
 *
 * Previously ran Shape + LP + SLA + daily snapshot in one invocation and hit
 * FUNCTION_INVOCATION_TIMEOUT (504) on Vercel. LP / reports / heavy SLA live
 * in /api/cron/nightly and manual admin sync.
 *
 * Auth: Vercel Cron Bearer token or x-cron-secret header.
 */
import { NextResponse } from "next/server";
import { isCronRequestAuthorized } from "@/lib/cron-auth";
import { hasShapeApiConfig } from "@/lib/shape-api/config";
import { runShapeApiSync } from "@/lib/shape-api/sync";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Vercel Hobby = 60s; Pro can raise via vercel.json / dashboard. Keep work bounded. */
export const maxDuration = 60;

type StepResult = { ok: boolean; durationMs: number; data?: unknown; error?: string };

async function step<T>(name: string, fn: () => Promise<T>): Promise<StepResult> {
  const start = Date.now();
  try {
    const data = await fn();
    return { ok: true, durationMs: Date.now() - start, data };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[cron/15min] ${name} failed:`, err);
    return { ok: false, durationMs: Date.now() - start, error: msg };
  }
}

async function handle(request: Request) {
  if (!isCronRequestAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const maxPagesDefault = Number(process.env.CRON_SHAPE_MAX_PAGES ?? 12);
  const catchupMaxPages = Number(process.env.CRON_SHAPE_CATCHUP_MAX_PAGES ?? 25);

  let maxPages = Number.isFinite(maxPagesDefault) && maxPagesDefault > 0 ? maxPagesDefault : 12;
  try {
    const admin = createSupabaseAdminClient();
    const { data: wm } = await admin
      .from("shape_sync_watermark")
      .select("updated_at")
      .eq("id", 1)
      .maybeSingle();
    const updatedAt = wm?.updated_at ? new Date(String(wm.updated_at)).getTime() : 0;
    const staleHours = updatedAt ? (Date.now() - updatedAt) / (60 * 60 * 1000) : 999;
    if (staleHours > 48 && Number.isFinite(catchupMaxPages) && catchupMaxPages > maxPages) {
      maxPages = catchupMaxPages;
    }
  } catch {
    /* use default maxPages */
  }

  const results: Record<string, StepResult> = {};

  results.shape = await step("shape", async () => {
    if (!hasShapeApiConfig()) return { skipped: true, reason: "Shape API not configured" };
    return await runShapeApiSync({
      mode: "incremental",
      maxPages: Number.isFinite(maxPages) && maxPages > 0 ? maxPages : 12,
      skipLpFuzzyLink: true,
    });
  });

  const anyFailures = Object.values(results).some((r) => !r.ok);
  return NextResponse.json(
    {
      ok: !anyFailures,
      ranAt: new Date().toISOString(),
      note: "Shape-only cron. LP + reports run on /api/cron/nightly.",
      maxPages,
      results,
    },
    { status: anyFailures ? 207 : 200 },
  );
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
