import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/** WooCommerce / legacy query noise — 301 to same path, other params preserved. */
const JUNK_QUERY_PARAMS = [
  "add-to-cart",
  "per_page",
  "per_row",
  "shop_view",
  "woo_ajax",
  "loop",
] as const;

export function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
  let changed = false;
  for (const key of JUNK_QUERY_PARAMS) {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      changed = true;
    }
  }
  if (!changed) {
    return NextResponse.next();
  }
  const qs = url.searchParams.toString();
  url.search = qs ? `?${qs}` : "";
  return NextResponse.redirect(url, 301);
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
