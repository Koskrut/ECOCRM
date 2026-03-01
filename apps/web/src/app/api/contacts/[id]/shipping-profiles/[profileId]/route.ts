import type { NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/api/proxy";

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; profileId: string }> },
) {
  const { id, profileId } = await ctx.params;
  return proxyToBackend(req, `/contacts/${id}/shipping-profiles/${profileId}`);
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; profileId: string }> },
) {
  const { id, profileId } = await ctx.params;
  return proxyToBackend(req, `/contacts/${id}/shipping-profiles/${profileId}`);
}
