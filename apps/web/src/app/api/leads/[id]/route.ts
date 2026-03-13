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
  const lastSegment = segments[segments.length - 1] ?? "";
  const derivedId = params.id ?? lastSegment;
  const upstream = `${API_URL}/leads/${derivedId}`;

  const r = await fetch(upstream, {
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

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const headers = await authHeader();
  const body = await req.json().catch(() => ({}));
  const params = await ctx.params;

  const url = new URL(req.url);
  const segments = url.pathname.split("/").filter(Boolean);
  const lastSegment = segments[segments.length - 1] ?? "";
  const derivedId = params.id ?? lastSegment;

  const r = await fetch(`${API_URL}/leads/${derivedId}`, {
    method: "PATCH",
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

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const headers = await authHeader();
  const params = await ctx.params;
  const id = params.id ?? "";

  const r = await fetch(`${API_URL}/leads/${id}`, {
    method: "DELETE",
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

