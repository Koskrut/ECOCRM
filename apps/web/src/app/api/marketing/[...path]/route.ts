import type { NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/api/proxy.server";

function buildBackendPath(path: string[]) {
  return `marketing/${path.join("/")}`;
}

type RouteCtx = { params: Promise<{ path: string[] }> };

export async function GET(req: NextRequest, { params }: RouteCtx) {
  const { path } = await params;
  return proxyToBackend(req, buildBackendPath(path));
}

export async function POST(req: NextRequest, { params }: RouteCtx) {
  const { path } = await params;
  return proxyToBackend(req, buildBackendPath(path));
}

export async function PUT(req: NextRequest, { params }: RouteCtx) {
  const { path } = await params;
  return proxyToBackend(req, buildBackendPath(path));
}

export async function DELETE(req: NextRequest, { params }: RouteCtx) {
  const { path } = await params;
  return proxyToBackend(req, buildBackendPath(path));
}
