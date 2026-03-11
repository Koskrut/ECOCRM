import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.API_URL ?? "http://localhost:3001";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ imageId: string }> },
) {
  const { imageId } = await ctx.params;
  const target = new URL(`${API_URL}/products/images/${imageId}/source`);
  req.nextUrl.searchParams.forEach((value, key) => target.searchParams.set(key, value));
  const res = await fetch(target.toString(), {
    method: "GET",
    headers: { Accept: req.headers.get("accept") ?? "image/*" },
    next: { revalidate: 86400 },
  });
  const resHeaders = new Headers(res.headers);
  resHeaders.delete("content-encoding");
  resHeaders.delete("content-length");
  if (!resHeaders.has("Cache-Control")) {
    resHeaders.set("Cache-Control", "public, max-age=86400, stale-while-revalidate=3600");
  }
  return new NextResponse(res.body, {
    status: res.status,
    headers: resHeaders,
  });
}
