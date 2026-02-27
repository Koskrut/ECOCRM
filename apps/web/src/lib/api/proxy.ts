import "server-only";

import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { API_URL } from "./config";

type ProxyOptions = {
  // если хочешь принудительно указать метод (обычно не нужно)
  method?: string;
};

export async function proxyToBackend(req: NextRequest, backendPath: string, opts: ProxyOptions = {}) {
  const url = new URL(req.url);

  // backend url + querystring
  const target = new URL(`${API_URL}${backendPath}`);
  target.search = url.search;

  const cookieStore = await cookies();
  const token = cookieStore.get("token")?.value;

  const headers = new Headers(req.headers);

  // обязательно: не тащим host/origin, чтобы не было CORS/прокси-артефактов
  headers.delete("host");
  headers.delete("origin");
  headers.delete("referer");

  if (token) {
    headers.set("authorization", `Bearer ${token}`);
  } else {
    // чтобы было понятно, почему 401
    // (можешь убрать, но полезно при дебаге)
    // console.warn("proxyToBackend: token cookie is missing");
  }

  // body читаем только если метод может иметь body
  const method = (opts.method ?? req.method).toUpperCase();
  const hasBody = !["GET", "HEAD"].includes(method);

  const body = hasBody ? await req.text() : undefined;

  const r = await fetch(target.toString(), {
    method,
    headers,
    body,
    cache: "no-store",
  });

  // пробрасываем ответ как есть
  const resBody = await r.text();
  const resHeaders = new Headers(r.headers);

  // чтобы не было проблем с компрессией/длиной
  resHeaders.delete("content-encoding");
  resHeaders.delete("content-length");

  return new NextResponse(resBody, {
    status: r.status,
    headers: resHeaders,
  });
}