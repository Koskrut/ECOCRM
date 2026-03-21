import { NextResponse } from "next/server";
import { API_URL } from "@/lib/api/config";

/** Публічний проксі без CRM cookie — для сторінки /pay/[token]. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const url = `${API_URL.replace(/\/+$/, "")}/public/payment-requests/by-token/${encodeURIComponent(token)}`;
  try {
    const r = await fetch(url, { cache: "no-store" });
    const text = await r.text();
    return new NextResponse(text, {
      status: r.status,
      headers: {
        "Content-Type": r.headers.get("content-type") ?? "application/json",
      },
    });
  } catch {
    return NextResponse.json({ message: "Backend unavailable" }, { status: 502 });
  }
}
