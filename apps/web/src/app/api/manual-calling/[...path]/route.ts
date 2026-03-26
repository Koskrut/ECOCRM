import type { NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/api/proxy";

function backendPath(req: NextRequest, segments: string[]) {
  const joined = segments.length ? segments.join("/") : "";
  const path = joined ? `manual-calling/${joined}` : "manual-calling";
  const qs = req.nextUrl.searchParams.toString();
  return `/${path}${qs ? `?${qs}` : ""}`;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> },
) {
  const { path: segments = [] } = await params;
  return proxyToBackend(req, backendPath(req, segments));
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> },
) {
  const { path: segments = [] } = await params;
  return proxyToBackend(req, backendPath(req, segments));
}
