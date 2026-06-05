import type { NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/api/proxy.server";

export async function GET(req: NextRequest, ctx: { params: Promise<{ bankAccountId: string }> }) {
  const { bankAccountId } = await ctx.params;
  return proxyToBackend(req, `integrations/upc/consent/start/${bankAccountId}`);
}
