import type { NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/api/proxy.server";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ imageId: string }> },
) {
  const { imageId } = await ctx.params;
  return proxyToBackend(req, `products/images/${imageId}/source`);
}
