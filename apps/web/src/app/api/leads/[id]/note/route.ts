import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { API_URL } from "@/lib/api/config";

async function authHeader(): Promise<Record<string, string>> {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const headers = await authHeader();
  const body = await req.json().catch(() => ({}));
  const params = await ctx.params;
  const id = params.id;

  const r = await fetch(`${API_URL}/leads/${id}/note`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
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
