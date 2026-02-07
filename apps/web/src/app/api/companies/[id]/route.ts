import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const API_URL = process.env.API_URL ?? "http://localhost:3001";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const token = (await cookies()).get("token")?.value;

  const r = await fetch(`${API_URL}/companies/${id}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  const text = await r.text();
  return new NextResponse(text, {
    status: r.status,
    headers: { "Content-Type": "application/json" },
  });
}
