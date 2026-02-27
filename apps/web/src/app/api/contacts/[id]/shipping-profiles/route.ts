import type { NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/api/proxy";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const qs = req.nextUrl.searchParams.toString();
  return proxyToBackend(req, `/contacts/${id}/shipping-profiles${qs ? `?${qs}` : ""}`);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return proxyToBackend(req, `/contacts/${id}/shipping-profiles`);
}
