import type { ZapierShapeReportPayload } from "./shape-report-payload";

export type ZapierNotifyResult =
  | { sent: true; status: number; attempts: number }
  | { sent: false; skipped: true; reason: string }
  | { sent: false; error: string; attempts: number };

const DEFAULT_MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postOnce(
  webhookUrl: string,
  payload: ZapierShapeReportPayload,
): Promise<{ ok: boolean; status: number; body: string }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  const secret = process.env.ZAPIER_WEBHOOK_SECRET?.trim();
  if (secret) {
    headers["X-QuestRock-Webhook-Secret"] = secret;
  }

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  const body = await res.text().catch(() => res.statusText);
  return { ok: res.ok, status: res.status, body };
}

/**
 * POST Shape report payload to Zapier with exponential backoff retry.
 * Retries on 429 and 5xx responses.
 */
export async function notifyZapierShapeReport(
  payload: ZapierShapeReportPayload,
  options?: { maxAttempts?: number },
): Promise<ZapierNotifyResult> {
  const webhookUrl = process.env.ZAPIER_SHAPE_REPORT_WEBHOOK_URL?.trim();
  if (!webhookUrl) {
    return {
      sent: false,
      skipped: true,
      reason: "ZAPIER_SHAPE_REPORT_WEBHOOK_URL not configured",
    };
  }

  const maxAttempts = options?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  let lastError = "Unknown error";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await postOnce(webhookUrl, payload);
      if (result.ok) {
        return { sent: true, status: result.status, attempts: attempt };
      }

      lastError = `Zapier webhook ${result.status}: ${result.body}`;
      const retryable = result.status === 429 || result.status >= 500;
      if (!retryable || attempt === maxAttempts) {
        console.error("[zapier/shape-report] webhook error:", lastError);
        return { sent: false, error: lastError, attempts: attempt };
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt === maxAttempts) {
        console.error("[zapier/shape-report] fetch failed:", lastError);
        return { sent: false, error: lastError, attempts: attempt };
      }
    }

    const delay = BASE_DELAY_MS * 2 ** (attempt - 1);
    await sleep(delay);
  }

  return { sent: false, error: lastError, attempts: maxAttempts };
}
