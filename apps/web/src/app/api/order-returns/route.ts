import type { NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/api/proxy";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const qs = url.searchParams.toString();
  const path = qs ? `/order-returns?${qs}` : "/order-returns";
  return proxyToBackend(req, path);
}
