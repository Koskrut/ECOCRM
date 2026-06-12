import type { NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/api/proxy.server";

export async function GET(req: NextRequest, ctx: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await ctx.params;
  return proxyToBackend(req, `/client-balances/orders/${orderId}`);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await ctx.params;
  return proxyToBackend(req, `/client-balances/orders/${orderId}/apply`);
}
