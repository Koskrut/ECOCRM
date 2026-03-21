import { NextResponse } from "next/server";
import { API_URL } from "@/lib/api/config";

/** Публічний проксі без CRM cookie (наприклад для зовнішніх інтеграцій). Сторінка /pay тягне бекенд напряму на сервері. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const url = `${API_URL.replace(/\/+$/, "")}/public/payment-requests/by-token/${encodeURIComponent(token)}`;
  const controller = new AbortController();
  const kill = setTimeout(() => controller.abort(), 25_000);
  try {
    const r = await fetch(url, { cache: "no-store", signal: controller.signal });
    const text = await r.text();
    return new NextResponse(text, {
      status: r.status,
      headers: {
        "Content-Type": r.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (e: unknown) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return NextResponse.json(
      { message: aborted ? "Backend timeout" : "Backend unavailable" },
      { status: aborted ? 504 : 502 },
    );
  } finally {
    clearTimeout(kill);
  }
}
