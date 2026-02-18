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

export async function GET(req: NextRequest) {
  const auth = getBearer(req);
  if (!auth) {
    return NextResponse.json(
      { message: "Missing Authorization header", error: "Unauthorized", statusCode: 401 },
      { status: 401 },
    );
  }

  const upstream = `${API_URL}/orders?page=1&pageSize=200`;

  const r = await fetch(upstream, {
    method: "GET",
    headers: { Authorization: auth },
    cache: "no-store",
  });

  const data = await r.json().catch(() => ({}));
  return NextResponse.json(data, { status: r.status });
}
