import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { API_URL } from "@/lib/api/config";

async function authHeader(): Promise<Record<string, string>> {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function PATCH(req: Request, ctx: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await ctx.params;
  const headers = await authHeader();
  const body = await req.text();
  const r = await fetch(`${API_URL}/work/daily-agenda/items/${itemId}`, {
    method: "PATCH",
    headers: { ...headers, "Content-Type": "application/json" },
    body,
    cache: "no-store",
  });
  const text = await r.text().catch(() => "");
  try {
    return NextResponse.json(text ? JSON.parse(text) : {}, { status: r.status });
  } catch {
    return new NextResponse(text, { status: r.status });
  }
}
