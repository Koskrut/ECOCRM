import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const LOGIN_PATH = "/login";

export function proxy(req: NextRequest) {
  const token = req.cookies.get("token")?.value;
  const pathname = req.nextUrl.pathname;
  const isLoginPage = pathname === LOGIN_PATH;
  const isApi = pathname.startsWith("/api");
  /** Next.js static chunks, HMR, images — must never redirect to login or JS loads as HTML. */
  const isNextInternal =
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml";
  /** /pay, /pay/, /pay/<token> — без урахування регістру (iOS / проксі інколи дають інший casing). */
  const isPublicPay = /^\/pay(\/|$)/i.test(pathname);
  const willRedirect =
    !token && !isLoginPage && !isApi && !isPublicPay && !isNextInternal;

  if (willRedirect) {
    const loginUrl = new URL(LOGIN_PATH, req.url);
    loginUrl.searchParams.set("from", req.nextUrl.pathname);
    const res = NextResponse.redirect(loginUrl, 307);
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    return res;
  }

  return NextResponse.next();
}
