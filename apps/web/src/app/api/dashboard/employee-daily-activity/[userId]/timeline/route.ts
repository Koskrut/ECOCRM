import type { NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/api/proxy";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ userId: string }> },
) {
  const { userId } = await ctx.params;
  return proxyToBackend(req, `/dashboard/employee-daily-activity/${userId}/timeline`);
}
