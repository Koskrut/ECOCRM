import type { NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/api/proxy.server";

export async function GET(req: NextRequest) {
  return proxyToBackend(req, "settings/contact-card-ui");
}

export async function PATCH(req: NextRequest) {
  return proxyToBackend(req, "settings/contact-card-ui");
}
