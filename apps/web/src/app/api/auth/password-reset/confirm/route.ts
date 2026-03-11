import { NextResponse } from "next/server";
import { API_URL } from "@/lib/api/config";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const r = await fetch(`${API_URL}/auth/password-reset/confirm`, {
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
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
