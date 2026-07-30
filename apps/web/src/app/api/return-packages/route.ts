import type { NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/api/proxy";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const qs = url.searchParams.toString();
  const path = qs ? `/return-packages?${qs}` : "/return-packages";
  return proxyToBackend(req, path);
}

export async function POST(req: NextRequest) {
  return proxyToBackend(req, "/return-packages");
}
