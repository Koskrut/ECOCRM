import type { NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/api/proxy.server";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const qs = req.nextUrl.searchParams.toString();
  return proxyToBackend(req, `field/shifts/${id}/samples${qs ? `?${qs}` : ""}`);
}
