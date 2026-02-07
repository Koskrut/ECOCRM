import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const API_URL = process.env.API_URL ?? "http://localhost:3001";

export async function GET() {
  const token = (await cookies()).get("token")?.value;

  const r = await fetch(`${API_URL}/auth/me`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  const text = await r.text();
  return new NextResponse(text, {
    status: r.status,
    headers: { "Content-Type": "application/json" },
  });
}
