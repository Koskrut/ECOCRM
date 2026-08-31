import type { NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/api/proxy.server";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  return proxyToBackend(req, `field/shifts/${id}/mobility`);
}
