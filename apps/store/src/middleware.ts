import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { JUNK_QUERY_PARAMS, homeQueryRedirect, legacyLocation } from "@/lib/legacy-redirect";

function isGonePath(pathname: string) {
  return (
    pathname === "/portfolio" ||
    pathname.startsWith("/portfolio/") ||
    pathname === "/project-cat" ||
    pathname.startsWith("/project-cat/") ||
    pathname === "/tag" ||
    pathname.startsWith("/tag/") ||
    pathname === "/blog" ||
    pathname.startsWith("/blog/")
  );
}

function redirectTo(request: NextRequest, location: string) {
  // Build a plain URL. NextURL copies the request's trailing-slash mode and would
  // turn /systems back into /systems/ when the incoming path had a slash.
  const dest = new URL(location, request.nextUrl.origin);
  return NextResponse.redirect(dest, 301);
}

export function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();

  // Post–WordPress legacy URLs: keep search traffic from hitting 404.
  if (url.pathname === "/about-us-3" || url.pathname === "/about-us-3/") {
    url.pathname = "/about";
    url.search = "";
    url.hash = "";
    return NextResponse.redirect(url, 301);
  }
  if (isGonePath(url.pathname)) {
    return new NextResponse("Gone", {
      status: 410,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const legacy = legacyLocation(url.pathname);
  if (legacy) {
    const params = new URLSearchParams(url.searchParams);
    for (const key of JUNK_QUERY_PARAMS) params.delete(key);
    const hashAt = legacy.indexOf("#");
    const path = hashAt >= 0 ? legacy.slice(0, hashAt) : legacy;
    const hash = hashAt >= 0 ? legacy.slice(hashAt) : "";
    const qs = params.toString();
    return redirectTo(request, `${path}${qs ? `?${qs}` : ""}${hash}`);
  }

  const homeTarget = homeQueryRedirect(url.pathname, url.searchParams);
  if (homeTarget) {
    return redirectTo(request, homeTarget);
  }

  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    const params = new URLSearchParams(url.searchParams);
    for (const key of JUNK_QUERY_PARAMS) params.delete(key);
    const qs = params.toString();
    return redirectTo(request, `${url.pathname.slice(0, -1)}${qs ? `?${qs}` : ""}`);
  }

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
