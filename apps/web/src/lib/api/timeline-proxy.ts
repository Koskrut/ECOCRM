import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { API_URL } from "./config";

export const TIMELINE_ENTITY_TYPES = new Set(["contact", "lead", "company", "order"]);

function safeJsonParse<T>(text: string): T | null {
  if (!text || !text.trim()) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** Proxy entity timeline to backend via API_URL (never re-fetch req.url — HTTPS→HTTP SSL mismatch). */
export async function proxyTimelineToBackend(
  req: Request,
  entityType: string,
  entityId: string,
): Promise<NextResponse> {
  if (!TIMELINE_ENTITY_TYPES.has(entityType)) {
    return NextResponse.json({ message: "Invalid entity type" }, { status: 400 });
  }
  const token = (await cookies()).get("token")?.value;
  const incoming = new URL(req.url);
  const params = new URLSearchParams();
  for (const key of ["limit", "cursor", "source", "kind"]) {
    const values = incoming.searchParams.getAll(key);
    for (const v of values) params.append(key, v);
  }
  const suffix = params.toString() ? `?${params.toString()}` : "";

  let r: Response;
  try {
    r = await fetch(`${API_URL}/timeline/${entityType}/${entityId}${suffix}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      cache: "no-store",
    });
  } catch (e) {
    const code = (e as { cause?: { code?: string } })?.cause?.code;
    if (code === "ECONNRESET" || (e as Error).message?.includes("ECONNRESET")) {
      return NextResponse.json(
        { message: "Backend unavailable. Start the API server." },
        { status: 503 },
      );
    }
    throw e;
  }

  const text = await r.text();
  if (!r.ok) {
    return new NextResponse(text, {
      status: r.status,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!safeJsonParse<{ items?: unknown }>(text)) {
    return NextResponse.json(
      { message: "Invalid timeline payload from backend", items: [], nextCursor: null },
      { status: 502 },
    );
  }
  return new NextResponse(text, {
    status: r.status,
    headers: { "Content-Type": "application/json" },
  });
}
