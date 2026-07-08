/**
 * 15-minute cron — Shape incremental sync ONLY (lightweight).
 *
 * Shape bulk export is ~5–7s/page; 12 pages alone exceeds Vercel's 60s limit.
 * This route caps pages, skips heavy post-processing, and uses a fetch budget.
 *
 * Auth: Vercel Cron Bearer token or x-cron-secret header.
 */
import { NextResponse } from "next/server";
import { isCronRequestAuthorized } from "@/lib/cron-auth";
import { hasShapeApiConfig } from "@/lib/shape-api/config";
import { runShapeApiSync } from "@/lib/shape-api/sync";

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

  // ~6s/page × 5 pages ≈ 30s fetch + ~10s upsert → fits in 60s Hobby limit.
  const maxPages = Number(process.env.CRON_SHAPE_MAX_PAGES ?? 5);
  const fetchBudgetMs = Number(process.env.CRON_SHAPE_FETCH_BUDGET_MS ?? 42_000);

  const results: Record<string, StepResult> = {};

  results.shape = await step("shape", async () => {
    if (!hasShapeApiConfig()) return { skipped: true, reason: "Shape API not configured" };
    return await runShapeApiSync({
      mode: "incremental",
      maxPages: Number.isFinite(maxPages) && maxPages > 0 ? maxPages : 5,
      fetchBudgetMs: Number.isFinite(fetchBudgetMs) && fetchBudgetMs > 0 ? fetchBudgetMs : 42_000,
      pageDelayMs: 0,
      lightweight: true,
      skipLpFuzzyLink: true,
    });
  });

  const anyFailures = Object.values(results).some((r) => !r.ok);
  return NextResponse.json(
    {
      ok: !anyFailures,
      ranAt: new Date().toISOString(),
      note: "Lightweight Shape cron (loans upsert only). Activity/LP/backfill run on nightly or manual sync.",
      maxPages,
      fetchBudgetMs,
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
