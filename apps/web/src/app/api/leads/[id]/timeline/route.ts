import { NextResponse } from "next/server";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const params = url.searchParams.toString();
  const suffix = params ? `?${params}` : "";
  const res = await fetch(new URL(`/api/timeline/lead/${id}${suffix}`, req.url), {
    method: "GET",
    headers: req.headers,
    cache: "no-store",
  });
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
