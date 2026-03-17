import type { NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/api/proxy.server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return proxyToBackend(req, `orders/${id}/documents/waybill`);
}
