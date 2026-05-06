import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { API_URL } from "@/lib/api/config";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const token = (await cookies()).get("token")?.value;
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const qs = new URLSearchParams();
  const limit = url.searchParams.get("limit");
  const cursor = url.searchParams.get("cursor");
  if (limit) qs.set("limit", limit);
  if (cursor) qs.set("cursor", cursor);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";

  const r = await fetch(`${API_URL}/companies/${id}/activities${suffix}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: "no-store",
  });

  const text = await r.text();
  return new NextResponse(text, {
    status: r.status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const token = (await cookies()).get("token")?.value;
  const { id } = await ctx.params;

  const body = await req.text();

  const r = await fetch(`${API_URL}/companies/${id}/activities`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body,
    cache: "no-store",
  });

  const text = await r.text();
  return new NextResponse(text, {
    status: r.status,
    headers: { "Content-Type": "application/json" },
  });
}
