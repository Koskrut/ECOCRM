import type { NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/api/proxy.server";

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; accountId: string }> },
) {
  const { id, accountId } = await ctx.params;
  return proxyToBackend(req, `conversations/${id}/telegram-accounts/${accountId}`);
}
