import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Meta sends `X-Hub-Signature-256: sha256=<hex>` over the raw request body.
 */
export function verifyMetaSignatureSha256(
  rawBody: Buffer | undefined,
  signatureHeader: string | undefined,
  appSecret: string,
): boolean {
  if (!rawBody?.length || !signatureHeader?.startsWith("sha256=") || !appSecret) {
    return false;
  }
  const expectedHex = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const expected = `sha256=${expectedHex}`;
  try {
    const a = Buffer.from(signatureHeader, "utf8");
    const b = Buffer.from(expected, "utf8");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export type MetaGraphLeadFields = {
  field_data?: Array<{ name: string; values: string[] }>;
  form_id?: string;
  created_time?: string | number;
};

export async function fetchMetaLeadFromGraph(
  leadgenId: string,
  pageAccessToken: string,
  graphVersion: string,
): Promise<MetaGraphLeadFields | null> {
  const ver = graphVersion.trim() || "v21.0";
  const url = new URL(`https://graph.facebook.com/${ver}/${encodeURIComponent(leadgenId)}`);
  url.searchParams.set("fields", "created_time,field_data,form_id");
  url.searchParams.set("access_token", pageAccessToken);
  const res = await fetch(url.toString(), { method: "GET" });
  if (!res.ok) {
    return null;
  }
  return (await res.json()) as MetaGraphLeadFields;
}

export function parseMetaCreatedTime(raw: unknown): Date {
  if (raw == null) return new Date();
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return new Date(raw * 1000);
  }
  const s = String(raw).trim();
  const asNum = Number(s);
  if (s !== "" && !Number.isNaN(asNum) && /^\d+(\.\d+)?$/.test(s)) {
    return new Date(asNum * 1000);
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}
