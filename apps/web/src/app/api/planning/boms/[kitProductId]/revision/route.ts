import type { NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/api/proxy.server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ kitProductId: string }> },
) {
  const { kitProductId } = await params;
  return proxyToBackend(req, `planning/boms/${kitProductId}/revision`);
}

