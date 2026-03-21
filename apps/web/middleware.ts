import type { NextRequest } from "next/server";
import { proxy } from "./src/proxy";

export function middleware(req: NextRequest) {
  return proxy(req);
}

// Must be a literal here — Next.js parses this at compile time (Turbopack).
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
