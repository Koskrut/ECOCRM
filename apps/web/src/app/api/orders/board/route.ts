import type { NextRequest } from "next/server";
import { proxyToBackend } from "@/lib/api/proxy";

export async function GET(req: NextRequest) {
  const qs = req.nextUrl.searchParams.toString();
  // раньше у тебя был upstream orders?page=1&pageSize=200 — оставляем как есть,
  // но если передаёшь qs — оно переопределит.
  return proxyToBackend(req, `/orders${qs ? `?${qs}` : "?page=1&pageSize=200"}`);
}
