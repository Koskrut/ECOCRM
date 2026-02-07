import { NextResponse } from "next/server";

const API_URL = process.env.API_URL ?? "http://localhost:3001";

export async function POST(req: Request) {
  const body = await req.json();

  const r = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await r.json().catch(() => ({}));

  if (!r.ok) {
    return NextResponse.json(data, { status: r.status });
  }

  const token = data.token ?? data.accessToken;
  const res = NextResponse.json({ ok: true });

  res.cookies.set("token", token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });

  return res;
}
