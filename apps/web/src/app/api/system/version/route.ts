import type { NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/api/proxy";

/** Public — used by mobile clients to verify the BFF base URL. */
export async function GET(req: NextRequest) {
  return proxyToBackend(req, "/system/version");
}
