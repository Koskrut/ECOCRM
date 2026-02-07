import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const API_URL = process.env.API_URL ?? "http://localhost:3001";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const authHeader = req.headers.get("authorization");
  const token = (await cookies()).get("token")?.value;

  const r = await fetch(`${API_URL}/orders/${id}/timeline`, {
    headers: authHeader
      ? { Authorization: authHeader }
      : token
        ? { Authorization: `Bearer ${token}` }
        : {},
  });

  const text = await r.text();
  return new NextResponse(text, {
    status: r.status,
    headers: { "Content-Type": "application/json" },
  });
}
