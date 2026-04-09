import { proxyToBackend } from "@/lib/api/proxy.server";
import type { NextRequest } from "next/server";

export async function PUT(req: NextRequest) {
  return proxyToBackend(req, "system/modules/enabled");
}
