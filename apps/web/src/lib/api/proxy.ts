import "server-only";

import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { API_URL } from "./config";
import { stripProxyRequestHeaders } from "./proxy-request-headers";

type ProxyOptions = {
  // если хочешь принудительно указать метод (обычно не нужно)
  method?: string;
};

export async function proxyToBackend(req: NextRequest, backendPath: string, opts: ProxyOptions = {}) {
  const url = new URL(req.url);

  // backend url + querystring
  const target = new URL(`${API_URL}${backendPath}`);
  target.search = url.search;

  const incomingAuth = req.headers.get("authorization")?.trim() || "";
  const cookieStore = await cookies();
  const cookieToken = cookieStore.get("token")?.value;
  const authHeader =
    incomingAuth || (cookieToken ? `Bearer ${cookieToken}` : "");

  const headers = new Headers(req.headers);
  stripProxyRequestHeaders(headers);

  if (authHeader) {
    headers.set("authorization", authHeader);
  }

  // body читаем только если метод может иметь body
  const method = (opts.method ?? req.method).toUpperCase();
  const hasBody = !["GET", "HEAD"].includes(method);

  const body = hasBody ? await req.text() : undefined;

  const outgoingHeaders: Headers =
    body !== undefined && body !== null
      ? (() => {
          const h = new Headers();
          h.set("Content-Type", "application/json");
          h.set("Content-Length", new TextEncoder().encode(body).length.toString());
          if (authHeader) h.set("Authorization", authHeader);
          return h;
        })()
      : headers;

  const doFetch = () =>
    fetch(target.toString(), {
      method,
      headers: outgoingHeaders,
      body,
      cache: "no-store",
    });

  let r: Response;
  try {
    r = await doFetch();
  } catch (e) {
    const cause = (e as { cause?: { code?: string } })?.cause;
    const isConnectionReset = cause?.code === "ECONNRESET" || (e as Error).message?.includes("ECONNRESET");
    if (isConnectionReset) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      try {
        r = await doFetch();
      } catch {
        return NextResponse.json(
          { message: "Backend unavailable. Start the API server (e.g. npm run dev in apps/backend)." },
          { status: 503 }
        );
      }
    } else {
      throw e;
    }
  }

  // пробрасываем ответ как есть
  const resBody = await r.text();
  const resHeaders = new Headers(r.headers);

  // чтобы не было проблем с компрессией/длиной
  resHeaders.delete("content-encoding");
  resHeaders.delete("content-length");

  // NextResponse не принимает 304 — маппим на 200
  const status = r.status === 304 ? 200 : r.status;

  return new NextResponse(resBody, {
    status,
    headers: resHeaders,
  });
}