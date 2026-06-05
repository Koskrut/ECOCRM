import type { NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/api/proxy.server";

export async function GET(req: NextRequest) {
  return proxyToBackend(req, "route-plans/geometry/preview", { method: "GET" });
}

export async function POST(req: NextRequest) {
  const qs = req.nextUrl.searchParams.toString();
  const body = await req.text();
  return proxyToBackend(req, `route-plans/geometry/preview${qs ? `?${qs}` : ""}`, {
    method: "POST",
    body,
    headers: { "Content-Type": "application/json" },
  });
}
