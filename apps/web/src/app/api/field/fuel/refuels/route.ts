import { NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/api/proxy.server";

export async function GET(req: NextRequest) {
  const qs = req.nextUrl.searchParams.toString();
  return proxyToBackend(req, `field/fuel/refuels${qs ? `?${qs}` : ""}`);
}

export async function POST(req: NextRequest) {
  const qs = req.nextUrl.searchParams.toString();
  return proxyToBackend(req, `field/fuel/refuels${qs ? `?${qs}` : ""}`);
}
