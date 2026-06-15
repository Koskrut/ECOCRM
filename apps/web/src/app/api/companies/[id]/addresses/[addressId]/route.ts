import type { NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/api/proxy";

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; addressId: string }> },
) {
  const { id, addressId } = await ctx.params;
  return proxyToBackend(req, `/companies/${id}/addresses/${addressId}`);
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; addressId: string }> },
) {
  const { id, addressId } = await ctx.params;
  return proxyToBackend(req, `/companies/${id}/addresses/${addressId}`);
}
