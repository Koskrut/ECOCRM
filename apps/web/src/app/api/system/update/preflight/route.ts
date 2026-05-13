import { proxyToBackend } from "@/lib/api/proxy.server";
import type { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  return proxyToBackend(req, "system/update/preflight");
}
