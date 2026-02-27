// apps/web/src/app/api/orders/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { API_URL } from "@/lib/api/config";

async function authHeader(): Promise<Record<string, string>> {
  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function GET(req: Request) {
  const headers = await authHeader();

  const { searchParams } = new URL(req.url);
  const qs = searchParams.toString();
  const upstream = `${API_URL}/orders${qs ? `?${qs}` : ""}`;

  const r = await fetch(upstream, {
    method: "GET",
    headers: {
      ...headers,
    },
    cache: "no-store",
  });

  const text = await r.text().catch(() => "");
  // пробуем вернуть json, иначе возвращаем как текст
  try {
    const data = text ? JSON.parse(text) : {};
    return NextResponse.json(data, { status: r.status });
  } catch {
    return new NextResponse(text, { status: r.status });
  }
}

export async function POST(req: Request) {
  const headers = await authHeader();
  const body = await req.json().catch(() => ({}));

  let r: Response;
  try {
    r = await fetch(`${API_URL}/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { message: `Backend unreachable: ${msg}` },
      { status: 502 },
    );
  }

  const text = await r.text().catch(() => "");
  try {
    const data = text ? JSON.parse(text) : {};
    return NextResponse.json(data, { status: r.status });
  } catch {
    return new NextResponse(text, { status: r.status });
  }
}