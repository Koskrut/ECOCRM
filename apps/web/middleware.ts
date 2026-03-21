import type { NextRequest } from "next/server";
import { proxy, config as proxyConfig } from "./src/proxy";

export function middleware(req: NextRequest) {
  return proxy(req);
}

export const config = proxyConfig;
