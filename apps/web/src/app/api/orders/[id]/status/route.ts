import type { NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/api/proxy";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return proxyToBackend(req, `/orders/${id}/status`);
}

// на всякий случай (если где-то дергаешь POST)
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return proxyToBackend(req, `/orders/${id}/status`);
}