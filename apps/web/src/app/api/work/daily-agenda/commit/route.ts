import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { API_URL } from "@/lib/api/config";

async function authHeader(): Promise<Record<string, string>> {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function POST(req: Request) {
  const headers = await authHeader();
  const body = await req.text();
  const r = await fetch(`${API_URL}/work/daily-agenda/commit`, {
    method: "POST",
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
