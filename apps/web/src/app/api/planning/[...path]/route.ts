import type { NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/api/proxy.server";

/**
 * Catch-all BFF for planning endpoints that do not have a dedicated route.ts.
 * Specific routes under /api/planning/* still take precedence (inventory-snapshots, boms, …).
 */
function buildBackendPath(path: string[]) {
  return `planning/${path.join("/")}`;
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

export async function PATCH(req: NextRequest, { params }: RouteCtx) {
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
