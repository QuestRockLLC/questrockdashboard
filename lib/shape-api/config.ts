// Bulk export MUST use secure.setshape.com — secure-api.setshape.com returns 404 for bulk.
const DEFAULT_BASE_URL = "https://secure.setshape.com/api";
const DEFAULT_CRM_ID = "20931";

export function getShapeApiConfig(): { baseUrl: string; apiKey: string; crmId: string } {
  const configuredBaseUrl = (process.env.SHAPE_API_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  // The bulk-export endpoint exists only on secure.setshape.com. Older env
  // examples used secure-api.setshape.com, which works for other Shape APIs
  // but returns 404 for reports.
  const baseUrl = configuredBaseUrl.replace(
    "https://secure-api.setshape.com/api",
    DEFAULT_BASE_URL,
  );
  const apiKey = process.env.SHAPE_API_KEY?.trim();
  const crmId = process.env.SHAPE_CRM_ID?.trim() || DEFAULT_CRM_ID;
  if (!apiKey) {
    throw new Error(
      "SHAPE_API_KEY is required for Shape API sync. Add it to .env.local or disable the sync."
    );
  }
  return { baseUrl, apiKey, crmId };
}

export function hasShapeApiConfig(): boolean {
  return Boolean(process.env.SHAPE_API_KEY?.trim());
}
