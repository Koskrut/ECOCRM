import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const token = req.cookies.get("token")?.value;

  // Какие страницы защищаем
  const protectedPaths = ["/orders", "/companies", "/contacts"];

  const isProtected = protectedPaths.some(
    (p) => req.nextUrl.pathname === p || req.nextUrl.pathname.startsWith(p + "/"),
  );

  // Не трогаем сам логин и API роуты
  if (req.nextUrl.pathname.startsWith("/login")) return NextResponse.next();
  if (req.nextUrl.pathname.startsWith("/api")) return NextResponse.next();

  if (isProtected && !token) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
