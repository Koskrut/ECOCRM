import { proxyToBackend } from "@/lib/api/proxy.server";
import type { NextRequest } from "next/server";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return proxyToBackend(req, `system/update/jobs/${encodeURIComponent(id)}`);
}
