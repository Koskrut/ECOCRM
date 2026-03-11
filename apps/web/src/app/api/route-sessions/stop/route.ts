import type { NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/api/proxy.server";

export async function POST(req: NextRequest) {
  const qs = req.nextUrl.searchParams.toString();
  return proxyToBackend(req, `route-sessions/stop${qs ? `?${qs}` : ""}`);
}
