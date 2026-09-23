import type { NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/api/proxy.server";

export async function GET(req: NextRequest) {
  return proxyToBackend(req, "canned-responses");
}

export async function POST(req: NextRequest) {
  return proxyToBackend(req, "canned-responses");
}
