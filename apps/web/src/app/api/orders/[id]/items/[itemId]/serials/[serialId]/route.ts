import type { NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/api/proxy.server";

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; itemId: string; serialId: string }> },
) {
  const { id, itemId, serialId } = await ctx.params;
  return proxyToBackend(req, `/orders/${id}/items/${itemId}/serials/${serialId}`);
}
