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

// ✅ совместимо: params может быть объектом или Promise
async function getParamsId(params: { id: string } | Promise<{ id: string }>): Promise<string> {
  const p: any = params as any;
  const resolved = typeof p?.then === "function" ? await p : p;
  return String(resolved?.id ?? "");
}

export async function GET(
  req: NextRequest,
  ctx: { params: { id: string } | Promise<{ id: string }> },
) {
  const id = await getParamsId(ctx.params);
  if (!id) {
    return NextResponse.json({ message: "Missing id param" }, { status: 400 });
  }

  const auth = getBearer(req);
  if (!auth) {
    return NextResponse.json({ message: "Missing Authorization header" }, { status: 401 });
  }

  const upstream = `${API_URL}/contacts/${id}/shipping-profiles`;

  const r = await fetch(upstream, {
    method: "GET",
    headers: { Authorization: auth },
    cache: "no-store",
  });

  const data = await r.json().catch(() => ({}));
  return NextResponse.json(data, { status: r.status });
}
