import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const API_URL = process.env.API_URL ?? "http://localhost:3001";

export async function GET(_req: Request) {
  const token = (await cookies()).get("token")?.value;

  const r = await fetch(`${API_URL}/orders/board`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: "no-store",
  });

  const text = await r.text();
  return new NextResponse(text, {
    status: r.status,
    headers: { "Content-Type": "application/json" },
  });
}
