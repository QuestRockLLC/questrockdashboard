import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getShapeReportRecipients,
  isShapeReportDeliveryEnabled,
  type ShapeReportRecipientGroup,
} from "@/lib/reports/shape-config";
import { buildShapeReportPayload, hashShapeReportPayload } from "@/lib/reports/shape/build-payload";
import { shouldRunCadenceToday } from "@/lib/reports/shape/period-utils";
import type { ShapeReportCadence, ShapeReportDeliveryResult } from "@/lib/reports/shape/types";
import { toZapierShapeReportPayload } from "@/lib/zapier/shape-report-payload";
import { notifyZapierShapeReport } from "@/lib/zapier/notify-shape-report";

export type DeliverShapeReportOptions = {
  cadence: ShapeReportCadence;
  force?: boolean;
  dryRun?: boolean;
  recipientGroup?: ShapeReportRecipientGroup;
  runId?: string;
  now?: Date;
};

async function findExistingRun(
  admin: SupabaseClient,
  cadence: ShapeReportCadence,
  periodStart: string,
  recipientGroup: string,
) {
  const { data } = await admin
    .from("shape_report_runs")
    .select("id,status,run_id")
    .eq("cadence", cadence)
    .eq("period_start", periodStart)
    .eq("recipient_group", recipientGroup)
    .maybeSingle();
  return data;
}

export async function deliverShapeReport(
  admin: SupabaseClient,
  options: DeliverShapeReportOptions,
): Promise<ShapeReportDeliveryResult> {
  const {
    cadence,
    force = false,
    dryRun = false,
    recipientGroup = "pilot_nikk",
    runId: runIdOverride,
    now,
  } = options;

  if (!force && !shouldRunCadenceToday(cadence, now)) {
    return {
      runId: runIdOverride ?? randomUUID(),
      cadence,
      status: "skipped",
      skippedReason: `Cadence ${cadence} not scheduled for today`,
      leadCount: 0,
    };
  }

  const runId = runIdOverride ?? randomUUID();
  const payload = await buildShapeReportPayload(admin, cadence, { runId, now });
  const sourceMeta = {
    sourceRecordsQueried: payload.sourceRecordsQueried,
    sourcePagesFetched: payload.sourcePagesFetched,
  };
  payload.recipientGroup = recipientGroup;
  payload.recipients = getShapeReportRecipients(recipientGroup).map((r) => ({
    email: r.email,
    name: r.name,
  }));

  const payloadHash = hashShapeReportPayload(payload);

  const existing = await findExistingRun(
    admin,
    cadence,
    payload.periodStart,
    recipientGroup,
  );

  if (!force && existing?.status === "sent") {
    return {
      runId: existing.run_id as string,
      cadence,
      status: "skipped",
      skippedReason: "Report already sent for this period",
      leadCount: payload.leadCount,
      ...sourceMeta,
    };
  }

  if (dryRun) {
    return {
      runId: payload.runId,
      cadence,
      status: "skipped",
      skippedReason: "dryRun=true",
      leadCount: payload.leadCount,
      ...sourceMeta,
    };
  }

  // Upsert run row as queued
  const { error: upsertErr } = await admin.from("shape_report_runs").upsert(
    {
      run_id: payload.runId,
      cadence,
      recipient_group: recipientGroup,
      period_start: payload.periodStart,
      period_end: payload.periodEnd,
      status: "queued",
      payload_hash: payloadHash,
      lead_count: payload.leadCount,
    },
    { onConflict: "cadence,period_start,recipient_group" },
  );
  if (upsertErr) throw upsertErr;

  if (!isShapeReportDeliveryEnabled()) {
    await admin
      .from("shape_report_runs")
      .update({
        status: "failed",
        error: "ZAPIER_SHAPE_REPORT_WEBHOOK_URL not configured",
      })
      .eq("run_id", payload.runId);

    return {
      runId: payload.runId,
      cadence,
      status: "failed",
      error: "ZAPIER_SHAPE_REPORT_WEBHOOK_URL not configured",
      leadCount: payload.leadCount,
      ...sourceMeta,
    };
  }

  const zapierPayload = toZapierShapeReportPayload(payload);
  const result = await notifyZapierShapeReport(zapierPayload);

  if ("sent" in result && result.sent) {
    await admin
      .from("shape_report_runs")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        zapier_status: result.status,
        error: null,
      })
      .eq("run_id", payload.runId);

    return {
      runId: payload.runId,
      cadence,
      status: "sent",
      leadCount: payload.leadCount,
      ...sourceMeta,
      zapierStatus: result.status,
    };
  }

  const errorMsg =
    "skipped" in result && result.skipped
      ? result.reason
      : "error" in result
        ? result.error
        : "Delivery failed";

  await admin
    .from("shape_report_runs")
    .update({ status: "failed", error: errorMsg })
    .eq("run_id", payload.runId);

  return {
    runId: payload.runId,
    cadence,
    status: "failed",
    error: errorMsg,
    leadCount: payload.leadCount,
    ...sourceMeta,
  };
}

export async function deliverAllDueShapeReports(
  admin: SupabaseClient,
  options?: { force?: boolean; dryRun?: boolean; now?: Date },
): Promise<ShapeReportDeliveryResult[]> {
  const cadences: ShapeReportCadence[] = ["morning_lo", "daily", "weekly", "monthly"];
  const results: ShapeReportDeliveryResult[] = [];

  for (const cadence of cadences) {
    const result = await deliverShapeReport(admin, {
      cadence,
      force: options?.force,
      dryRun: options?.dryRun,
      now: options?.now,
    });
    results.push(result);
  }

  return results;
}
