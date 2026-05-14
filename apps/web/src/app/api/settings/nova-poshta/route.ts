import type { NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/api/proxy.server";

export async function GET(req: NextRequest) {
  return proxyToBackend(req, "settings/nova-poshta");
}

export async function PATCH(req: NextRequest) {
  return proxyToBackend(req, "settings/nova-poshta");
}
