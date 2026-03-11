import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.API_URL ?? "http://localhost:3001";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const res = await fetch(`${API_URL}/store/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return NextResponse.json(
      { message: (data as { message?: string }).message ?? "Registration failed" },
      { status: res.status },
    );
  }
  const token = (data as { token?: string }).token;
  const response = NextResponse.json({ customer: (data as { customer?: unknown }).customer });
  if (token) {
    response.cookies.set("store_token", token, {
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
      httpOnly: true,
      sameSite: "lax",
    });
  }
  return response;
}
