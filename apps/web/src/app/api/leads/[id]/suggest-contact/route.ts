import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { API_URL } from "@/lib/api/config";

async function authHeader(): Promise<Record<string, string>> {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const headers = await authHeader();
  const params = await ctx.params;

  const url = new URL(req.url);
  const segments = url.pathname.split("/").filter(Boolean);
  const derivedId = params.id ?? segments[segments.length - 2] ?? "";

  const r = await fetch(`${API_URL}/leads/${derivedId}/suggest-contact`, {
    method: "GET",
    headers,
    cache: "no-store",
  });

  const text = await r.text().catch(() => "");
  try {
    const data = text ? JSON.parse(text) : {};
    return NextResponse.json(data, { status: r.status });
  } catch {
    return new NextResponse(text, { status: r.status });
  }
}

