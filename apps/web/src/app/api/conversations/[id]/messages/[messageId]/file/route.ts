import type { NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/api/proxy.server";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; messageId: string }> },
) {
  const { id, messageId } = await ctx.params;
  return proxyToBackend(req, `conversations/${id}/messages/${messageId}/file`);
}
