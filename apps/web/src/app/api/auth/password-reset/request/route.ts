import { NextResponse } from "next/server";
import { API_URL } from "@/lib/api/config";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const r = await fetch(`${API_URL}/auth/password-reset/request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  return NextResponse.json(data, { status: r.status });
}
