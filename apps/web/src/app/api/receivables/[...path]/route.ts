import type { NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/api/proxy";

function buildBackendPath(req: NextRequest, path: string[]) {
  const joined = path.join("/");
  const qs = req.nextUrl.searchParams.toString();
  return `/receivables/${joined}${qs ? `?${qs}` : ""}`;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const resolved = await params;
  return proxyToBackend(req, buildBackendPath(req, resolved.path));
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const resolved = await params;
  return proxyToBackend(req, buildBackendPath(req, resolved.path));
}
