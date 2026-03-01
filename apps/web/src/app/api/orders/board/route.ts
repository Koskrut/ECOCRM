import type { NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/api/proxy";

export async function GET(req: NextRequest) {
  const qs = req.nextUrl.searchParams.toString();
  const base = qs
    ? `${qs}&board=true&withCompanyClient=true`
    : "page=1&pageSize=200&board=true&withCompanyClient=true";
  return proxyToBackend(req, `/orders?${base}`);
}
