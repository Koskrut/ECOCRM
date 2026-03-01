import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const LOGIN_PATH = "/login";

export function proxy(req: NextRequest) {
  const token = req.cookies.get("token")?.value;
  const pathname = req.nextUrl.pathname;
  const isLoginPage = pathname === LOGIN_PATH;
  const isApi = pathname.startsWith("/api");
  const willRedirect = !token && !isLoginPage && !isApi;

  if (willRedirect) {
    const loginUrl = new URL(LOGIN_PATH, req.url);
    loginUrl.searchParams.set("from", req.nextUrl.pathname);
    const res = NextResponse.redirect(loginUrl, 307);
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
