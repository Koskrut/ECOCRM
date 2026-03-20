import { proxyToBackend } from "@/lib/api/proxy.server";
import { NextRequest } from "next/server";

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  return proxyToBackend(req, `payments/${id}/allocation`);
}
