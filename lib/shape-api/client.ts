import type { ShapeBulkExportRequest, ShapeBulkExportResponse } from "@/lib/shape-api/types";
import { getShapeApiConfig } from "@/lib/shape-api/config";

const DEFAULT_MAX_ATTEMPTS = 4;
const BASE_RETRY_DELAY_MS = 800;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Parses Retry-After as seconds; falls back to exponential backoff if absent/invalid. */
function retryDelayMs(res: Response, attempt: number): number {
  const header = res.headers.get("retry-after");
  const seconds = header ? Number(header) : NaN;
  if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  return BASE_RETRY_DELAY_MS * 2 ** (attempt - 1);
}

async function postBulkExport(
  baseUrl: string,
  apiKey: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return fetch(`${baseUrl}/leads/bulk/export`, {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

/**
 * Shape's account-level throttle returns 429 "Too Many Attempts" under
 * bursty/parallel page fetches. Retry with backoff (honoring Retry-After
 * when present) before giving up — callers should also keep concurrency low.
 */
export async function shapeBulkExport(
  params: ShapeBulkExportRequest,
  options?: { maxAttempts?: number },
): Promise<ShapeBulkExportResponse> {
  const { baseUrl, apiKey } = getShapeApiConfig();

  const body: Record<string, unknown> = {
    fields: params.fields,
  };
  // Shape expects pageNumber inside the selected date-range object, not at
  // the payload root. This endpoint is account-scoped by the API key and does
  // not take CRM ID in the URL.
  if (params.createdDateRange) {
    body.createdDateRange = {
      ...params.createdDateRange,
      pageNumber: String(params.pageNumber),
    };
  }
  if (params.updatedDateRange) {
    body.updatedDateRange = {
      ...params.updatedDateRange,
      pageNumber: String(params.pageNumber),
    };
  }

  const maxAttempts = Math.max(1, options?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
  let res: Response | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    res = await postBulkExport(baseUrl, apiKey, body);
    if (res.ok) break;

    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt === maxAttempts) break;

    await sleep(retryDelayMs(res, attempt));
  }

  if (!res) {
    throw new Error("Shape API bulk export failed: no response received.");
  }

  if (!res.ok) {
    const text = await res.text();
    const summary =
      text.length > 200 ? `${text.slice(0, 200).replace(/\s+/g, " ")}…` : text.replace(/\s+/g, " ");
    throw new Error(
      `Shape API bulk export failed: ${res.status} ${res.statusText}. ${summary} (Check base URL and that your account has API access.)`
    );
  }

  const json = (await res.json()) as ShapeBulkExportResponse;
  return json;
}
