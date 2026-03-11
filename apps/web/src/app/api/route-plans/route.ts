import type { NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/api/proxy.server";

export async function GET(req: NextRequest) {
  const qs = req.nextUrl.searchParams.toString();
  return proxyToBackend(req, `route-plans${qs ? `?${qs}` : ""}`);
}

export async function PUT(req: NextRequest) {
  const qs = req.nextUrl.searchParams.toString();
  return proxyToBackend(req, `route-plans${qs ? `?${qs}` : ""}`);
}

