import type { NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/api/proxy";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; phoneId: string }> },
) {
  const { id, phoneId } = await ctx.params;
  return proxyToBackend(req, `/contacts/${id}/phones/${phoneId}/set-primary`);
}
