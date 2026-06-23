import type { NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/api/proxy.server";

type RouteContext = { params: Promise<{ userId: string }> };

export async function GET(req: NextRequest, context: RouteContext) {
  const { userId } = await context.params;
  return proxyToBackend(req, `settings/day-plan/users/${userId}`);
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  const { userId } = await context.params;
  return proxyToBackend(req, `settings/day-plan/users/${userId}`);
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  const { userId } = await context.params;
  return proxyToBackend(req, `settings/day-plan/users/${userId}`);
}
