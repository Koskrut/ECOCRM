import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.API_URL ?? "http://localhost:3001";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  return proxy(req, await ctx.params);
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  return proxy(req, await ctx.params);
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  return proxy(req, await ctx.params);
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
) {
  return proxy(req, await ctx.params);
}

async function proxy(
  req: NextRequest,
  { path }: { path: string[] },
) {
  const pathStr = path.join("/");
  const url = new URL(req.url);
  const target = new URL(`${API_URL}/store/${pathStr}`);
  target.search = url.search;

  const storeToken = (await cookies()).get("store_token")?.value;
  const headers = new Headers(req.headers);
  headers.delete("host");
  if (storeToken) headers.set("Authorization", `Bearer ${storeToken}`);

  let body: ArrayBuffer | string | undefined;
  if (req.method !== "GET" && req.method !== "HEAD") {
    const buf = await req.arrayBuffer();
    if (buf.byteLength > 0) {
      headers.set("Content-Type", "application/json");
      const bodyStr = new TextDecoder().decode(buf);
      body = bodyStr;
      try {
        const parsed = JSON.parse(bodyStr) as Record<string, unknown>;
        if (parsed.sessionId && typeof parsed.sessionId === "string") {
          target.searchParams.set("sessionId", parsed.sessionId);
        }
        if (pathStr === "checkout") {
          if (parsed.phone != null && typeof parsed.phone === "string") {
            target.searchParams.set("phone", parsed.phone.trim());
          }
          const first = parsed.firstName ?? parsed.name;
          if (first != null && typeof first === "string" && first.trim()) {
            target.searchParams.set("firstName", first.trim());
          }
        }
      } catch {
        // ignore
      }
    } else {
      body = undefined;
    }
  } else {
    body = undefined;
  }

  let res: Response;
  try {
    res = await fetch(target.toString(), {
      method: req.method,
      headers,
      body,
      cache: "no-store",
    });
  } catch (err) {
    const cause = err instanceof Error ? err.cause : undefined;
    const isRefused =
      (cause as NodeJS.ErrnoException)?.code === "ECONNREFUSED" ||
      (err instanceof TypeError && err.message === "fetch failed");
    if (isRefused) {
      return NextResponse.json(
        {
          message:
            "Сервер магазину тимчасово недоступний. Запустіть бэкенд (npm run dev:backend).",
        },
        { status: 502 },
      );
    }
    throw err;
  }

  const resHeaders = new Headers(res.headers);
  resHeaders.delete("content-encoding");
  resHeaders.delete("content-length");
  return new NextResponse(res.body, {
    status: res.status,
    headers: resHeaders,
  });
}
