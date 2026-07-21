"use client";

import { useState } from "react";

type Cadence = "daily" | "weekly" | "monthly";

type SendResult = {
  ok?: boolean;
  cadence?: Cadence;
  status?: "sent" | "failed" | "skipped";
  leadCount?: number;
  runId?: string;
  error?: string;
  skippedReason?: string;
};

const REPORTS: Array<{
  cadence: Cadence;
  label: string;
  description: string;
}> = [
  {
    cadence: "daily",
    label: "Send daily report",
    description: "Today’s new and updated Shape leads, notes, risks, and action items.",
  },
  {
    cadence: "weekly",
    label: "Send weekly report",
    description: "Current-week source trends, LO activity, statuses, and note insights.",
  },
  {
    cadence: "monthly",
    label: "Send monthly report",
    description: "Current-month lead rollup, source mix, LO performance, and recommendations.",
  },
];

export function ShapeReportEmailTester() {
  const [sending, setSending] = useState<Cadence | null>(null);
  const [result, setResult] = useState<SendResult | null>(null);

  async function sendReport(cadence: Cadence) {
    setSending(cadence);
    setResult(null);

    try {
      const res = await fetch("/api/admin/reports/shape/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cadence }),
      });
      const data = (await res.json()) as SendResult;
      setResult(data);
    } catch (error) {
      setResult({
        status: "failed",
        error: error instanceof Error ? error.message : "Unable to send report.",
      });
    } finally {
      setSending(null);
    }
  }

  return (
    <div className="mt-4">
      <div className="grid gap-3 lg:grid-cols-3">
        {REPORTS.map((report) => (
          <div key={report.cadence} className="rounded-lg border border-border bg-background p-4">
            <div className="text-sm font-semibold">{report.label.replace("Send ", "")}</div>
            <p className="mt-1 min-h-10 text-xs leading-5 text-mutedForeground">
              {report.description}
            </p>
            <button
              type="button"
              onClick={() => sendReport(report.cadence)}
              disabled={sending !== null}
              className="mt-4 inline-flex w-full items-center justify-center rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sending === report.cadence ? "Building and sending…" : report.label}
            </button>
          </div>
        ))}
      </div>

      {result ? (
        <div
          className={`mt-4 rounded-lg border px-4 py-3 text-sm ${
            result.status === "sent"
              ? "border-emerald-500/30 bg-emerald-500/10"
              : "border-red-500/30 bg-red-500/10"
          }`}
        >
          {result.status === "sent" ? (
            <>
              <strong>{result.cadence} report sent to Nikk.</strong>{" "}
              It used {result.leadCount ?? 0} live Shape lead
              {(result.leadCount ?? 0) === 1 ? "" : "s"}.
              {result.runId ? (
                <span className="mt-1 block text-xs text-mutedForeground">
                  Run ID: <span className="font-mono">{result.runId}</span>
                </span>
              ) : null}
            </>
          ) : (
            <>
              <strong>Report was not sent.</strong>{" "}
              {result.error ?? result.skippedReason ?? "Unknown error"}
            </>
          )}
        </div>
      ) : null}

      <p className="mt-3 text-xs text-mutedForeground">
        Test sends use live Shape data for the current reporting period and are delivered through
        Zapier to the configured Nikk pilot address.
      </p>
    </div>
  );
}
