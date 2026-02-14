// apps/web/src/app/api/orders/[id]/np/ttn/route.ts
import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.API_URL ?? "http://localhost:3001";

function getBearer(req: NextRequest) {
  const h = req.headers.get("authorization");
  if (h && h.toLowerCase().startsWith("bearer ")) return h;

  const token =
    req.cookies.get("token")?.value ||
    req.cookies.get("accessToken")?.value ||
    req.cookies.get("auth_token")?.value;

  if (token) return `Bearer ${token}`;
  return null;
}

async function getParamsId(params: { id: string } | Promise<{ id: string }>) {
  const p: any = params as any;
  const resolved = typeof p?.then === "function" ? await p : p;
  return String(resolved?.id ?? "");
}

export async function POST(
  req: NextRequest,
  ctx: { params: { id: string } | Promise<{ id: string }> },
) {
  const id = await getParamsId(ctx.params);
  if (!id) return NextResponse.json({ message: "Missing id param" }, { status: 400 });

  const auth = getBearer(req);
  if (!auth) return NextResponse.json({ message: "Missing Authorization header" }, { status: 401 });

  const body = await req.json().catch(() => ({}));

  const upstream = `${API_URL}/orders/${id}/np/ttn`;
  const r = await fetch(upstream, {
    method: "POST",
    headers: {
      Authorization: auth,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const data = await r.json().catch(() => ({}));
  return NextResponse.json(data, { status: r.status });
}
