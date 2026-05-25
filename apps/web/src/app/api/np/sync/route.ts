import type { NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/api/proxy";

export async function POST(req: NextRequest) {
  return proxyToBackend(req, "/np/sync", { method: "POST" });
}
