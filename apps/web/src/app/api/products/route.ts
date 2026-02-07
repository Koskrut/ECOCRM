import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const API_URL = process.env.API_URL ?? "http://localhost:3001";

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
