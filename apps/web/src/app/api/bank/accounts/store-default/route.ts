import type { NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/api/proxy.server";

export async function PATCH(req: NextRequest) {
  return proxyToBackend(req, "bank/accounts/store-default");
}
