import "server-only";

import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { API_URL } from "./config";

function joinUrl(base: string, path: string) {
  const b = base.replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

async function getAuthHeaders() {
  const store = await cookies();
  const token = store.get("token")?.value;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function proxyToBackend(req: NextRequest, backendPath: string) {
  const url = new URL(req.url);

  // переносим query string
  const target = new URL(joinUrl(API_URL, backendPath));
  target.search = url.search;

  const auth = await getAuthHeaders();

  // копируем headers, но не тащим hop-by-hop и не ломаем content-length
  const headers = new Headers(req.headers);
  headers.delete("host");
  headers.delete("connection");
  headers.delete("content-length");

  // подмешиваем авторизацию
  Object.entries(auth).forEach(([k, v]) => headers.set(k, v));

  const method = req.method.toUpperCase();

  // body только для не-GET/HEAD
  const body =
    method === "GET" || method === "HEAD" ? undefined : await req.arrayBuffer();

  // #region agent log
  if (method === "POST" && backendPath === "products/stock/upload") {
    const contentType = req.headers.get("content-type") ?? "";
    fetch("http://127.0.0.1:7242/ingest/58313e80-8970-4da9-b340-4c7a66d3124e", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "proxy.server.ts:proxyToBackend",
        message: "Proxy forwarding stock upload",
        data: {
          hypothesisId: "H1",
          contentType: contentType.substring(0, 80),
          hasMultipart: contentType.includes("multipart"),
          bodyByteLength: body ? (body as ArrayBuffer).byteLength : 0,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  }
  // #endregion

  const r = await fetch(target.toString(), {
    method,
    headers,
    body,
    redirect: "manual",
  });

  // пробрасываем ответ как есть
  const resHeaders = new Headers(r.headers);
  resHeaders.delete("content-encoding"); // чтобы Next не ругался на gzip/br
  // NextResponse не принимает 304 — маппим на 200
  const status = r.status === 304 ? 200 : r.status;
  return new NextResponse(r.body, {
    status,
    headers: resHeaders,
  });
}