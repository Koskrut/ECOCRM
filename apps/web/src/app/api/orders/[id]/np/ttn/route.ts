import type { NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/api/proxy.server";

function ttnPath(id: string, req: NextRequest) {
  const q = req.nextUrl.searchParams.toString();
  return `/np/ttn/${id}${q ? `?${q}` : ""}`;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return proxyToBackend(req, ttnPath(id, req));
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return proxyToBackend(req, ttnPath(id, req));
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return proxyToBackend(req, `/np/ttn/${id}`);
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return proxyToBackend(req, `/np/ttn/${id}`);
}
