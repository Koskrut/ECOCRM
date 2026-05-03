import type { NextRequest } from "next/server";
import { proxyToBackend } from "./proxy";

/** Build `/prefix/seg1/seg2?query` for catch-all API routes. */
export function catchAllBackendPath(req: NextRequest, prefix: string, segments: string[]): string {
  const joined = segments.length ? segments.join("/") : "";
  const base = joined ? `${prefix}/${joined}` : prefix;
  const qs = req.nextUrl.searchParams.toString();
  return `/${base}${qs ? `?${qs}` : ""}`;
}

type Params = Promise<{ path?: string[] }>;

async function segmentsOf(ctx: { params: Params }): Promise<string[]> {
  const { path } = await ctx.params;
  return path ?? [];
}

export function createCatchAllProxy(prefix: string) {
  return {
    GET: async (req: NextRequest, ctx: { params: Params }) =>
      proxyToBackend(req, catchAllBackendPath(req, prefix, await segmentsOf(ctx))),
    POST: async (req: NextRequest, ctx: { params: Params }) =>
      proxyToBackend(req, catchAllBackendPath(req, prefix, await segmentsOf(ctx))),
    PATCH: async (req: NextRequest, ctx: { params: Params }) =>
      proxyToBackend(req, catchAllBackendPath(req, prefix, await segmentsOf(ctx))),
    PUT: async (req: NextRequest, ctx: { params: Params }) =>
      proxyToBackend(req, catchAllBackendPath(req, prefix, await segmentsOf(ctx))),
    DELETE: async (req: NextRequest, ctx: { params: Params }) =>
      proxyToBackend(req, catchAllBackendPath(req, prefix, await segmentsOf(ctx))),
  };
}
