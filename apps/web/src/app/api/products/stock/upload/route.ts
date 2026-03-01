import { NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/api/proxy.server";

export async function POST(req: NextRequest) {
  return proxyToBackend(req, "products/stock/upload");
}
