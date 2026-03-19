import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { API_URL } from "@/lib/api/config";
import { proxyToBackend } from "@/lib/api/proxy.server";

export async function GET(req: Request) {
  const token = (await cookies()).get("token")?.value;

  const url = new URL(req.url);
  const qs = url.searchParams.toString();

  // Проксируем search/page/pageSize как есть
  const upstream = `${API_URL}/products${qs ? `?${qs}` : ""}`;

  const r = await fetch(upstream, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: "no-store",
  });

  const text = await r.text();
  return new NextResponse(text, {
    status: r.status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(req: NextRequest) {
  return proxyToBackend(req, "products");
}
