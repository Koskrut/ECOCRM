import type { NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/api/proxy.server";

export async function GET(req: NextRequest, ctx: { params: Promise<{ contactId: string }> }) {
  const { contactId } = await ctx.params;
  return proxyToBackend(req, `/client-balances/contacts/${contactId}`);
}
