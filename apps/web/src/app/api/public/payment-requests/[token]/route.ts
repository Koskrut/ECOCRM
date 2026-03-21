import { appendFileSync } from "node:fs";
import { NextResponse } from "next/server";
import { API_URL } from "@/lib/api/config";

const DEBUG_LOG = "/Users/konstantin/CRM/.cursor/debug-c6a409.log";

function dbgLine(payload: Record<string, unknown>) {
  try {
    appendFileSync(DEBUG_LOG, `${JSON.stringify({ ...payload, timestamp: Date.now() })}\n`);
  } catch {
    /* local debug only */
  }
}

/** Публічний проксі без CRM cookie — для сторінки /pay/[token]. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const url = `${API_URL.replace(/\/+$/, "")}/public/payment-requests/by-token/${encodeURIComponent(token)}`;
  // #region agent log
  dbgLine({
    sessionId: "c6a409",
    hypothesisId: "H3",
    location: "public-payment-requests/route.ts:GET",
    message: "proxy to backend start",
    data: {
      tokenLen: token.length,
      apiUrlHost: (() => {
        try {
          return new URL(API_URL).hostname;
        } catch {
          return "invalid-API_URL";
        }
      })(),
    },
  });
  // #endregion
  const controller = new AbortController();
  const kill = setTimeout(() => controller.abort(), 25_000);
  try {
    const r = await fetch(url, { cache: "no-store", signal: controller.signal });
    const text = await r.text();
    // #region agent log
    dbgLine({
      sessionId: "c6a409",
      hypothesisId: "H3",
      location: "public-payment-requests/route.ts:GET",
      message: "backend response",
      data: { status: r.status, bodyLen: text.length },
    });
    // #endregion
    console.warn("[pay-public-api] backend ok", { status: r.status, tokenLen: token.length, bodyLen: text.length });
    return new NextResponse(text, {
      status: r.status,
      headers: {
        "Content-Type": r.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (e: unknown) {
    const aborted = e instanceof Error && e.name === "AbortError";
    // #region agent log
    dbgLine({
      sessionId: "c6a409",
      hypothesisId: "H3",
      location: "public-payment-requests/route.ts:GET",
      message: "backend fetch failed",
      data: { aborted, errName: e instanceof Error ? e.name : "unknown" },
    });
    // #endregion
    console.warn("[pay-public-api] backend fail", { aborted, tokenLen: token.length, errName: e instanceof Error ? e.name : "unknown" });
    return NextResponse.json(
      { message: aborted ? "Backend timeout" : "Backend unavailable" },
      { status: aborted ? 504 : 502 },
    );
  } finally {
    clearTimeout(kill);
  }
}
