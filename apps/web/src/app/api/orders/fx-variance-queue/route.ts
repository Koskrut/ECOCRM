import type { NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/api/proxy";

export async function GET(req: NextRequest) {
  return proxyToBackend(req, "/orders/fx-variance-queue");
}
