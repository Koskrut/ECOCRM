import type { NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/api/proxy";

export async function GET(req: NextRequest) {
  const qs = req.nextUrl.searchParams.toString();
  return proxyToBackend(req, `/users${qs ? `?${qs}` : ""}`);
}

export async function POST(req: NextRequest) {
  return proxyToBackend(req, "/users");
}
